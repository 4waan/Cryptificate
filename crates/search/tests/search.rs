//! End-to-end search runs on the story matrices.

use cryptificate_core::design::AnyMatrix;
use cryptificate_core::linalg::aes_mixcolumns;
use cryptificate_core::report::{CandidateOrigin, SymbolicCheck};
use cryptificate_core::{AnyProgram, Gf256, Instruction, Profile};
use cryptificate_search::baseline::{aes_shared_sum, poseidon2_external3};
use cryptificate_search::{
    run_search, run_search_json, symbolic_check, SearchOutput, SearchRequest, Stop,
};
use serde_json::json;

fn aes_search(seed: &str, profile: Profile) -> SearchOutput {
    let mut req = SearchRequest::new(AnyMatrix::Gf256(aes_mixcolumns()), profile);
    req.seed = seed.into();
    req.seed_given = true;
    run_search(&req)
}

#[test]
fn quick_search_beats_the_known_aes_circuit() {
    let out = aes_search("c0ffee", Profile::Quick);
    assert!(out.generated <= 8);
    assert_eq!(out.shortlist.len(), 1);
    let best = out.candidate(&out.shortlist[0]).unwrap();
    assert_eq!(best.symbolic, SymbolicCheck::Pass);
    assert_eq!(best.origin, CandidateOrigin::Search);
    let ops = best.costs.ops;
    // The known circuit has 15 XORs and 4 xtimes; sharing x0^x1 and x2^x3
    // across outputs needs fewer XORs.
    assert!(ops.add < 15, "{ops:?}");
    assert_eq!(ops.xtime, 4, "{ops:?}");
    assert_eq!(ops.mul, 4, "{ops:?}");
    match &best.program {
        AnyProgram::Gf256(p) => assert_eq!(p.coefficient_matrix(), aes_mixcolumns()),
        other => panic!("unexpected program {other:?}"),
    }
    assert!(out.improvement.found, "{:?}", out.improvement);
    let ids: Vec<&str> = out.baselines.iter().map(|b| b.id.as_str()).collect();
    assert_eq!(ids, ["baseline-direct", "baseline-known"]);
    let direct = &out.baselines[0].costs.ops;
    assert_eq!((direct.add, direct.xtime), (16, 4));
}

#[test]
fn search_is_reproducible_from_its_seed() {
    let a = aes_search("1234", Profile::Research);
    let b = aes_search("1234", Profile::Research);
    let ids = |o: &SearchOutput| -> Vec<(String, String, String)> {
        o.history
            .iter()
            .map(|h| (h.id.clone(), h.seed.clone(), h.costs.identity.clone()))
            .collect()
    };
    assert_eq!(ids(&a), ids(&b));
    assert_eq!(a.shortlist, b.shortlist);
    assert!(a.shortlist.len() <= 3);
    assert!(a.generated <= 64);
    // Every history entry is a distinct, symbolically checked circuit.
    let mut identities: Vec<&str> = a
        .history
        .iter()
        .map(|h| h.costs.identity.as_str())
        .collect();
    identities.sort_unstable();
    identities.dedup();
    assert_eq!(identities.len(), a.history.len());
    assert!(a.history.iter().all(|h| h.symbolic == SymbolicCheck::Pass));
    assert!(matches!(a.stopped, Stop::MaxCandidates | Stop::Exhausted));
}

#[test]
fn incorrect_candidates_are_rejected() {
    // The "one wire goes wrong" circuit: xtime(x0 ^ x1) becomes xtime(x0 ^ x2).
    let mut p = aes_shared_sum();
    p.instructions[3] = Instruction::Add { a: 0, b: 2 };
    let m = AnyMatrix::Gf256(aes_mixcolumns());
    let reason = symbolic_check(&AnyProgram::Gf256(p), &m).unwrap();
    assert!(reason.contains("coefficient (0, 1)"), "{reason}");
    assert_eq!(
        symbolic_check(&AnyProgram::Gf256(aes_shared_sum()), &m),
        None
    );
    // Dangling references are rejected structurally.
    let mut bad = aes_shared_sum();
    bad.outputs[0] = 99;
    assert!(symbolic_check(&AnyProgram::Gf256(bad), &m).is_some());
}

#[test]
fn bn254_search_finds_the_shared_sum() {
    let req = SearchRequest::new(AnyMatrix::Bn254(poseidon2_external3()), Profile::Quick);
    let out = run_search(&req);
    let best = out.candidate(&out.shortlist[0]).unwrap();
    assert_eq!((best.costs.ops.add, best.costs.ops.mul), (5, 0));
    // The known circuit is also 5 additions, so this is no improvement.
    assert!(!out.improvement.found);
    // Some attempt reproduces the known circuit exactly, up to scheduling.
    assert!(out
        .history
        .iter()
        .any(|h| h.same_as.as_deref() == Some("baseline-known")));
    assert!(out.improvement.note.starts_with("No improvement"));
}

#[test]
fn json_entry_point_and_user_baseline() {
    let user = json!({
        "field": "gf256", "width": 4, "name": "mine",
        "instructions": [{"op": "add", "a": 0, "b": 1}],
        "outputs": [4, 1, 2, 3]
    });
    let input = json!({
        "field": "gf256", "width": 4,
        "matrix": [["02","03","01","01"],["01","02","03","01"],["01","01","02","03"],["03","01","01","02"]],
        "profile": "quick", "seed": "ab", "maxCandidates": 3, "synthMs": 5000,
        "program": user
    });
    let out = run_search_json(&input).unwrap();
    assert_eq!(out["kind"], "search");
    assert_eq!(out["generated"], 3);
    assert_eq!(out["budget"]["maxCandidates"], 3);
    assert_eq!(out["budget"]["synthMs"], 5000);
    assert_eq!(out["user"]["equivalent"], false);
    assert_eq!(out["user"]["mismatch"]["row"], 0);
    let h = &out["history"][0];
    for key in [
        "id", "seed", "strategy", "ops", "depth", "temps", "symbolic", "identity",
    ] {
        assert!(!h[key].is_null(), "history entry lacks {key}: {h}");
    }
    assert!(h["ops"]["add"].is_u64() && h["ops"]["mul"].is_u64());
    let c = &out["candidates"][0];
    assert_eq!(c["program"]["field"], "gf256");
    assert_eq!(c["origin"], "search");
    assert_eq!(out["baselines"][1]["origin"], "baseline-known");
    // A zero synthesis budget generates nothing and says so.
    let mut none = input.clone();
    none["synthMs"] = json!(0);
    let out = run_search_json(&none).unwrap();
    assert_eq!(out["generated"], 0);
    assert_eq!(out["stopped"], "synthesis-budget");
    assert_eq!(out["improvement"]["found"], false);
    assert_eq!(out["shortlist"], json!([]));
}

#[test]
fn row_scaled_aes_and_experimental_widths() {
    let mut m = aes_mixcolumns();
    m[0] = [0x04, 0x06, 0x02, 0x02].map(Gf256).to_vec();
    let out = run_search(&SearchRequest::new(
        AnyMatrix::Gf256(m.clone()),
        Profile::Quick,
    ));
    assert!(out.baselines.iter().all(|b| b.id != "baseline-known"));
    let best = out.candidate(&out.shortlist[0]).unwrap();
    match &best.program {
        AnyProgram::Gf256(p) => assert_eq!(p.coefficient_matrix(), m),
        _ => unreachable!(),
    }
    let small = vec![vec![Gf256(2), Gf256(3)], vec![Gf256(3), Gf256(2)]];
    let out = run_search(&SearchRequest::new(AnyMatrix::Gf256(small), Profile::Quick));
    assert!(!out.shortlist.is_empty());
}
