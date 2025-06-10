const { sum } = require('../utils/mathUtils');

describe('Testes básicos', () => {
  test('Soma de números', () => {
    expect(sum(1, 2)).toBe(3);
    expect(sum(-1, 1)).toBe(0);
    expect(sum(0, 0)).toBe(0);
  });
});