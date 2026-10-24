//! Circuit synthesis: hash-consed node graph, shared-pair extraction and
//! program emission.
//!
//! Lowering an [`Expr`] turns every sum with two or more terms into a
//! *target*: a set of nodes whose sum must be computed. Targets may contain
//! placeholders for other targets (a sum under a multiplication). Pair
//! extraction (after Paar) then repeatedly picks the pair of nodes that
//! occurs in the most targets, materializes its sum once and substitutes it
//! everywhere, until every target is a single node. Ties are broken by a
//! seeded random generator. Over GF(2^8) a target is a set and substitution
//! cancels equal members (`a + a = 0`); over BN254 a target is a multiset and
//! nothing cancels.
//!
//! Emission resolves placeholders, hash-conses again (commutative `add`
//! operands are ordered), drops dead nodes, and chooses an instruction order
//! with few live temporaries.

use std::collections::{HashMap, HashSet};

use cryptificate_core::linalg::basis;
use cryptificate_core::{Field, FieldKind, Instruction, Program};
use rand::seq::SliceRandom;
use rand::Rng;

use crate::expr::Expr;

/// Index of a node in a [`Graph`].
pub type NodeId = usize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum Def<F> {
    Input(usize),
    /// Operands ordered `a <= b`.
    Add(NodeId, NodeId),
    Mul(F, NodeId),
    /// Placeholder for the sum of target `t`.
    Target(usize),
}

#[derive(Clone, Debug)]
struct TargetSet<F> {
    /// Sorted; over GF(2^8) without repeats.
    members: Vec<NodeId>,
    form: Vec<F>,
}

/// Options for [`Graph::lower`] and [`Graph::extract_pairs`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PairOptions {
    /// Extract shared pairs across targets; otherwise every target is summed
    /// on its own, left to right.
    pub shared: bool,
    /// Probability of trying, before each extraction step and for each
    /// target with three or more members, to complete the target from one
    /// or two existing nodes with the right coefficients.
    pub shortcuts: f64,
    /// Among pairs of equal gain, prefer the one whose sum is shallowest.
    pub shallow: bool,
    /// Over BN254, compute `2x` as `x + x` instead of a multiplication.
    pub double_as_add: bool,
}

/// A hash-consed graph of linear nodes with pending sums (targets).
pub struct Graph<F: Field> {
    width: usize,
    defs: Vec<Def<F>>,
    forms: Vec<Vec<F>>,
    depths: Vec<usize>,
    memo: HashMap<Def<F>, NodeId>,
    /// Every node with a given coefficient vector, in creation order.
    by_form: HashMap<Vec<F>, Vec<NodeId>>,
    targets: Vec<TargetSet<F>>,
    target_nodes: Vec<NodeId>,
    target_memo: HashMap<Vec<NodeId>, usize>,
}

impl<F: Field> Graph<F> {
    /// An empty graph over `width` inputs.
    pub fn new(width: usize) -> Self {
        let mut g = Graph {
            width,
            defs: Vec::new(),
            forms: Vec::new(),
            depths: Vec::new(),
            memo: HashMap::new(),
            by_form: HashMap::new(),
            targets: Vec::new(),
            target_nodes: Vec::new(),
            target_memo: HashMap::new(),
        };
        for j in 0..width {
            g.intern(Def::Input(j));
        }
        g
    }

    fn cancels() -> bool {
        F::KIND == FieldKind::Gf256
    }

    fn intern(&mut self, def: Def<F>) -> NodeId {
        let def = match def {
            Def::Add(a, b) if a > b => Def::Add(b, a),
            d => d,
        };
        if let Some(&id) = self.memo.get(&def) {
            return id;
        }
        let (form, depth) = match def {
            Def::Input(j) => (basis(self.width, j), 0),
            Def::Add(a, b) => (
                self.forms[a]
                    .iter()
                    .zip(&self.forms[b])
                    .map(|(&x, &y)| x + y)
                    .collect(),
                1 + self.depths[a].max(self.depths[b]),
            ),
            Def::Mul(k, a) => (
                self.forms[a].iter().map(|&x| k * x).collect(),
                1 + self.depths[a],
            ),
            Def::Target(t) => {
                let members = &self.targets[t].members;
                let d = members.iter().map(|&m| self.depths[m]).max().unwrap_or(0);
                let extra = usize::BITS - (members.len().max(1) - 1).leading_zeros();
                (self.targets[t].form.clone(), d + extra as usize)
            }
        };
        let id = self.defs.len();
        self.defs.push(def);
        self.by_form.entry(form.clone()).or_default().push(id);
        self.forms.push(form);
        self.depths.push(depth);
        self.memo.insert(def, id);
        id
    }

    /// The node for input `j`.
    pub fn input(&self, j: usize) -> NodeId {
        j
    }

    /// `a + b`.
    pub fn add(&mut self, a: NodeId, b: NodeId) -> NodeId {
        self.intern(Def::Add(a, b))
    }

    /// `k * a`.
    pub fn mul(&mut self, k: F, a: NodeId) -> NodeId {
        self.intern(Def::Mul(k, a))
    }

    /// A pending sum of `members`, or `None` if it is zero.
    pub fn sum(&mut self, mut members: Vec<NodeId>) -> Option<NodeId> {
        members.sort_unstable();
        if Self::cancels() {
            members = cancel_pairs(&members);
        }
        match members.len() {
            0 => None,
            1 => Some(members[0]),
            _ => {
                if let Some(&t) = self.target_memo.get(&members) {
                    return Some(self.target_nodes[t]);
                }
                let mut form = vec![F::zero(); self.width];
                for &m in &members {
                    for (a, &b) in form.iter_mut().zip(&self.forms[m]) {
                        *a = *a + b;
                    }
                }
                let t = self.targets.len();
                self.targets.push(TargetSet {
                    members: members.clone(),
                    form,
                });
                self.target_memo.insert(members, t);
                let node = self.intern(Def::Target(t));
                self.target_nodes.push(node);
                Some(node)
            }
        }
    }

    /// Lowers an expression; `None` means the expression is zero.
    pub fn lower(&mut self, e: &Expr<F>, opts: &PairOptions) -> Option<NodeId> {
        match e {
            Expr::Input(j) => Some(self.input(*j)),
            Expr::Scale(k, inner) => {
                if k.is_zero() {
                    return None;
                }
                let a = self.lower(inner, opts)?;
                if k.is_one() {
                    Some(a)
                } else if opts.double_as_add && !Self::cancels() && *k == F::from_u64(2) {
                    Some(self.add(a, a))
                } else {
                    Some(self.mul(*k, a))
                }
            }
            Expr::Sum(children) => {
                let members: Vec<NodeId> = children
                    .iter()
                    .filter_map(|c| self.lower(c, opts))
                    .collect();
                self.sum(members)
            }
        }
    }

    /// Reduces every target to a single node.
    pub fn extract_pairs<R: Rng>(&mut self, opts: &PairOptions, rng: &mut R) {
        if !opts.shared {
            for t in 0..self.targets.len() {
                while self.targets[t].members.len() >= 2 {
                    let m = &self.targets[t].members;
                    let (u, v) = (m[0], m[1]);
                    let w = self.add(u, v);
                    replace_pair(&mut self.targets[t].members, u, v, w, Self::cancels());
                }
            }
            return;
        }
        loop {
            if opts.shortcuts > 0.0 {
                self.try_shortcuts(opts.shortcuts, rng);
            }
            let mut counts: HashMap<(NodeId, NodeId), usize> = HashMap::new();
            for t in &self.targets {
                if t.members.len() < 2 {
                    continue;
                }
                let mut seen = HashSet::new();
                for i in 0..t.members.len() {
                    for j in i + 1..t.members.len() {
                        let p = (t.members[i], t.members[j]);
                        if seen.insert(p) {
                            *counts.entry(p).or_insert(0) += 1;
                        }
                    }
                }
            }
            if counts.is_empty() {
                break;
            }
            // Gain: additions saved minus additions spent (an existing sum is free).
            let score = |&(u, v): &(NodeId, NodeId), c: usize| -> (isize, isize) {
                let exists = self.memo.contains_key(&Def::Add(u, v));
                let gain = c as isize - if exists { 0 } else { 1 };
                let depth = if opts.shallow {
                    -(self.depths[u].max(self.depths[v]) as isize)
                } else {
                    0
                };
                (gain, depth)
            };
            let mut pairs: Vec<((NodeId, NodeId), (isize, isize))> =
                counts.iter().map(|(p, &c)| (*p, score(p, c))).collect();
            pairs.sort_unstable_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
            let best = pairs[0].1;
            let tied: Vec<(NodeId, NodeId)> = pairs
                .iter()
                .take_while(|p| p.1 == best)
                .map(|p| p.0)
                .collect();
            let (u, v) = tied[rng.gen_range(0..tied.len())];
            let w = self.add(u, v);
            let cancels = Self::cancels();
            for t in &mut self.targets {
                if contains_pair(&t.members, u, v) {
                    replace_pair(&mut t.members, u, v, w, cancels);
                }
            }
        }
    }

    /// Nodes that depend on `p` (including `p`).
    fn dependents(&self, p: NodeId) -> Vec<bool> {
        let mut dep = vec![false; self.defs.len()];
        dep[p] = true;
        loop {
            let mut changed = false;
            for (id, def) in self.defs.iter().enumerate() {
                if dep[id] {
                    continue;
                }
                let hit = match *def {
                    Def::Input(_) => false,
                    Def::Add(a, b) => dep[a] || dep[b],
                    Def::Mul(_, a) => dep[a],
                    Def::Target(t) => self.targets[t].members.iter().any(|&m| dep[m]),
                };
                if hit {
                    dep[id] = true;
                    changed = true;
                }
            }
            if !changed {
                return dep;
            }
        }
    }

    /// Completes targets from one or two existing nodes whose coefficients
    /// add up to the target's. Over BN254 the two nodes must involve disjoint
    /// inputs, so nothing cancels.
    fn try_shortcuts<R: Rng>(&mut self, prob: f64, rng: &mut R) {
        for t in 0..self.targets.len() {
            if self.targets[t].members.len() < 3 || !rng.gen_bool(prob.clamp(0.0, 1.0)) {
                continue;
            }
            let p = self.target_nodes[t];
            let dep = self.dependents(p);
            let form = self.targets[t].form.clone();
            let same = self
                .by_form
                .get(&form)
                .and_then(|ns| ns.iter().copied().find(|&n| !dep[n]));
            if let Some(n) = same {
                self.targets[t].members = vec![n];
                continue;
            }
            let mut order: Vec<NodeId> = (0..self.defs.len()).filter(|&n| !dep[n]).collect();
            order.shuffle(rng);
            for n1 in order {
                let need: Vec<F> = form
                    .iter()
                    .zip(&self.forms[n1])
                    .map(|(&a, &b)| a - b)
                    .collect();
                let cancels = Self::cancels();
                let found = self.by_form.get(&need).and_then(|ns| {
                    ns.iter().copied().find(|&n2| {
                        !dep[n2]
                            && !(cancels && n1 == n2)
                            && (cancels || disjoint(&self.forms[n1], &self.forms[n2]))
                    })
                });
                let Some(n2) = found else {
                    continue;
                };
                let mut m = vec![n1, n2];
                m.sort_unstable();
                self.targets[t].members = m;
                break;
            }
        }
    }

    fn resolve(&self, mut n: NodeId) -> Option<NodeId> {
        loop {
            match self.defs[n] {
                Def::Target(t) => {
                    let m = &self.targets[t].members;
                    assert!(m.len() <= 1, "targets must be reduced before emission");
                    n = *m.first()?;
                }
                _ => return Some(n),
            }
        }
    }

    /// Emits a program computing `outputs` (`None` is a zero output),
    /// trying several emission orders and keeping the one with the fewest
    /// live temporaries. Every target must have been reduced.
    pub fn emit(&self, outputs: &[Option<NodeId>]) -> Program<F> {
        let resolved: Vec<Option<NodeId>> = outputs
            .iter()
            .map(|o| o.and_then(|n| self.resolve(n)))
            .collect();
        let mut best: Option<(usize, Program<F>)> = None;
        for perm in permutations(outputs.len()) {
            for deep_first in [false, true] {
                let p = self.emit_order(&resolved, &perm, deep_first);
                let temps = p.max_live_temporaries();
                if best.as_ref().is_none_or(|(t, _)| temps < *t) {
                    best = Some((temps, p));
                }
            }
        }
        best.expect("at least one order").1
    }

    fn emit_order(
        &self,
        outputs: &[Option<NodeId>],
        order: &[usize],
        deep_first: bool,
    ) -> Program<F> {
        let mut e = Emitter {
            g: self,
            regs: HashMap::new(),
            memo: HashMap::new(),
            instructions: Vec::new(),
            deep_first,
        };
        let mut out_regs = vec![0usize; outputs.len()];
        for &i in order {
            out_regs[i] = match outputs[i] {
                Some(n) => e.emit(n),
                None => e.push(Instruction::Mul { k: F::zero(), a: 0 }),
            };
        }
        Program {
            width: self.width,
            name: None,
            instructions: e.instructions,
            outputs: out_regs,
        }
    }
}

struct Emitter<'a, F: Field> {
    g: &'a Graph<F>,
    regs: HashMap<NodeId, usize>,
    memo: HashMap<Instruction<F>, usize>,
    instructions: Vec<Instruction<F>>,
    deep_first: bool,
}

impl<F: Field> Emitter<'_, F> {
    fn push(&mut self, ins: Instruction<F>) -> usize {
        if let Some(&r) = self.memo.get(&ins) {
            return r;
        }
        let r = self.g.width + self.instructions.len();
        self.instructions.push(ins);
        self.memo.insert(ins, r);
        r
    }

    fn emit(&mut self, n: NodeId) -> usize {
        let n = self.g.resolve(n).expect("nonzero node");
        if let Some(&r) = self.regs.get(&n) {
            return r;
        }
        let r = match self.g.defs[n] {
            Def::Input(j) => j,
            Def::Add(a, b) => {
                let (first, second) = if self.deep_first && self.g.depths[b] > self.g.depths[a] {
                    (b, a)
                } else {
                    (a, b)
                };
                let r1 = self.emit(first);
                let r2 = self.emit(second);
                self.push(Instruction::Add {
                    a: r1.min(r2),
                    b: r1.max(r2),
                })
            }
            Def::Mul(k, a) => {
                let ra = self.emit(a);
                self.push(Instruction::Mul { k, a: ra })
            }
            Def::Target(_) => unreachable!("resolved above"),
        };
        self.regs.insert(n, r);
        r
    }
}

fn permutations(n: usize) -> Vec<Vec<usize>> {
    fn go(prefix: &mut Vec<usize>, used: &mut [bool], out: &mut Vec<Vec<usize>>) {
        if prefix.len() == used.len() {
            out.push(prefix.clone());
            return;
        }
        for i in 0..used.len() {
            if !used[i] {
                used[i] = true;
                prefix.push(i);
                go(prefix, used, out);
                prefix.pop();
                used[i] = false;
            }
        }
    }
    let mut out = Vec::new();
    go(&mut Vec::new(), &mut vec![false; n], &mut out);
    out
}

fn cancel_pairs(sorted: &[NodeId]) -> Vec<NodeId> {
    let mut out: Vec<NodeId> = Vec::with_capacity(sorted.len());
    for &m in sorted {
        if out.last() == Some(&m) {
            out.pop();
        } else {
            out.push(m);
        }
    }
    out
}

fn contains_pair(members: &[NodeId], u: NodeId, v: NodeId) -> bool {
    if u == v {
        members.iter().filter(|&&m| m == u).count() >= 2
    } else {
        members.contains(&u) && members.contains(&v)
    }
}

fn replace_pair(members: &mut Vec<NodeId>, u: NodeId, v: NodeId, w: NodeId, cancels: bool) {
    for x in [u, v] {
        let i = members
            .iter()
            .position(|&m| m == x)
            .expect("member present");
        members.remove(i);
    }
    match members.binary_search(&w) {
        Ok(i) if cancels => {
            members.remove(i);
        }
        Ok(i) | Err(i) => members.insert(i, w),
    }
}

fn disjoint<F: Field>(a: &[F], b: &[F]) -> bool {
    a.iter().zip(b).all(|(x, y)| x.is_zero() || y.is_zero())
}

/// Rewrites a finished program with local identities and re-emits it:
///
/// * `k*a + k*b = k*(a + b)` when both products have no other use (over
///   GF(2^8) with `k = 02`, xtime(a) xor xtime(b) = xtime(a xor b));
/// * over BN254, `k1*(k2*a) = (k1 k2)*a` when the inner product has no other
///   use, `1*a = a`, and optionally `2*a = a + a`.
///
/// Emission hash-conses and removes dead instructions.
pub fn peephole<F: Field>(p: &Program<F>, double_as_add: bool) -> Program<F> {
    let w = p.width;
    let mut uses = vec![0usize; p.register_count()];
    for ins in &p.instructions {
        for r in ins.operands() {
            uses[r] += 1;
        }
    }
    for &r in &p.outputs {
        uses[r] += 1;
    }
    let mut g = Graph::new(w);
    let mut node_of: Vec<NodeId> = (0..w).collect();
    let single_mul = |r: usize| -> Option<(F, usize)> {
        if r < w || uses[r] != 1 {
            return None;
        }
        match p.instructions[r - w] {
            Instruction::Mul { k, a } => Some((k, a)),
            _ => None,
        }
    };
    let cancels = F::KIND == FieldKind::Gf256;
    let scale = |g: &mut Graph<F>, k: F, n: NodeId| -> NodeId {
        if k.is_one() {
            n
        } else if !cancels && double_as_add && k == F::from_u64(2) {
            g.add(n, n)
        } else {
            g.mul(k, n)
        }
    };
    for ins in &p.instructions {
        let n = match *ins {
            Instruction::Add { a, b } => match (single_mul(a), single_mul(b)) {
                (Some((ka, xa)), Some((kb, xb))) if ka == kb && !ka.is_one() && a != b => {
                    let s = g.add(node_of[xa], node_of[xb]);
                    scale(&mut g, ka, s)
                }
                _ => g.add(node_of[a], node_of[b]),
            },
            Instruction::Mul { k, a } => match single_mul(a) {
                Some((k2, x)) if !cancels && !k2.is_one() => scale(&mut g, k * k2, node_of[x]),
                _ => scale(&mut g, k, node_of[a]),
            },
        };
        node_of.push(n);
    }
    let outs: Vec<Option<NodeId>> = p.outputs.iter().map(|&r| Some(node_of[r])).collect();
    g.emit(&outs)
}

/// Every node reachable from the outputs of `p`, for tests.
#[cfg(test)]
pub(crate) fn live_registers<F: Field>(p: &Program<F>) -> std::collections::BTreeSet<usize> {
    let mut live = std::collections::BTreeSet::new();
    let mut stack: Vec<usize> = p.outputs.clone();
    while let Some(r) = stack.pop() {
        if live.insert(r) && r >= p.width {
            stack.extend(p.instructions[r - p.width].operands());
        }
    }
    live
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::expr::{cancel_gf256, factor, primitive_gf256};
    use cryptificate_core::linalg::aes_mixcolumns;
    use cryptificate_core::{Bn254, Gf256};
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    const SHARED: PairOptions = PairOptions {
        shared: true,
        shortcuts: 1.0,
        shallow: true,
        double_as_add: true,
    };

    fn horner_aes(seed: u64) -> Program<Gf256> {
        let mut rng = ChaCha20Rng::seed_from_u64(seed);
        let exprs: Vec<_> = primitive_gf256(&aes_mixcolumns())
            .into_iter()
            .map(|e| cancel_gf256(factor(e, 1.0, &mut rng)))
            .collect();
        let mut g = Graph::new(4);
        let outs: Vec<_> = exprs.iter().map(|e| g.lower(e, &SHARED)).collect();
        g.extract_pairs(&SHARED, &mut rng);
        g.emit(&outs)
    }

    #[test]
    fn horner_aes_shares_pairs() {
        for seed in 0..20 {
            let p = horner_aes(seed);
            p.check_at("").unwrap();
            assert_eq!(p.coefficient_matrix(), aes_mixcolumns(), "seed {seed}");
            let ops = p.op_counts();
            assert_eq!(ops.xtime, 4, "seed {seed}");
            assert!(ops.add <= 13, "seed {seed}: {ops:?}");
            // Emission keeps only live instructions.
            assert_eq!(live_registers(&p).len(), p.register_count(), "seed {seed}");
        }
    }

    #[test]
    fn peephole_factors_xtime_pairs() {
        // y = xtime(x0) + xtime(x1), y' = x2: four instructions become two.
        let p = Program::<Gf256> {
            width: 2,
            name: None,
            instructions: vec![
                Instruction::Mul { k: Gf256(2), a: 0 },
                Instruction::Mul { k: Gf256(2), a: 1 },
                Instruction::Add { a: 2, b: 3 },
            ],
            outputs: vec![4, 1],
        };
        let q = peephole(&p, false);
        assert_eq!(q.coefficient_matrix(), p.coefficient_matrix());
        assert_eq!(q.op_counts().xtime, 1);
        assert_eq!(q.instructions.len(), 2);
    }

    #[test]
    fn bn254_doubling_and_constant_folding() {
        let two = Bn254::from(2);
        let three = Bn254::from(3);
        let p = Program::<Bn254> {
            width: 3,
            name: None,
            instructions: vec![
                Instruction::Mul { k: two, a: 0 },   // 3
                Instruction::Mul { k: three, a: 3 }, // 4 = 6 x0
                Instruction::Mul { k: two, a: 1 },   // 5
                Instruction::Add { a: 4, b: 5 },     // 6
                Instruction::Mul {
                    k: Bn254::one(),
                    a: 2,
                }, // 7
            ],
            outputs: vec![6, 7, 2],
        };
        let q = peephole(&p, true);
        assert_eq!(q.coefficient_matrix(), p.coefficient_matrix());
        let ops = q.op_counts();
        assert_eq!(ops.mul, 1, "{q:?}");
        assert_eq!(ops.add, 2, "{q:?}");
    }

    #[test]
    fn bn254_targets_do_not_cancel() {
        let mut g = Graph::<Bn254>::new(3);
        let opts = PairOptions {
            shortcuts: 0.0,
            ..SHARED
        };
        let x = |j| Expr::<Bn254>::Input(j);
        let e = Expr::Sum(vec![x(0), x(0), x(1)]);
        let n = g.lower(&e, &opts);
        let mut rng = ChaCha20Rng::seed_from_u64(0);
        g.extract_pairs(&opts, &mut rng);
        let p = g.emit(&[n, Some(1), Some(2)]);
        assert_eq!(
            p.coefficient_matrix()[0],
            vec![Bn254::from(2), Bn254::one(), Bn254::zero()]
        );
    }
}
