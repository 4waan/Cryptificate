import { describe, expect, it } from 'vitest';
import { parseHash } from './route';

describe('parseHash', () => {
  it.each([
    ['', { view: 'story', step: undefined }],
    ['#/story/3', { view: 'story', step: 3 }],
    ['#/story/9', { view: 'story', step: undefined }],
    ['#/workspace', { view: 'workspace', step: undefined }],
    ['#/experiments', { view: 'experiments', step: undefined }],
    ['#/workspace?d=zAbC_-1', { view: 'workspace', step: undefined, share: 'zAbC_-1' }],
    ['#/workspace?other=1', { view: 'workspace', step: undefined }],
    ['#/story/2?d=zAbC', { view: 'story', step: 2 }],
    ['#/nonsense', { view: 'story', step: undefined }],
  ])('%j', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });
});
