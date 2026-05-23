const { applyPostPlatformAccountFilter } = require('../src/lib/postPlatformAccountFilter');

/** Minimal query stub that records .eq(field, val) chains */
function makeQuerySpy() {
  const calls = [];
  const chain = {
    eq(field, val) {
      calls.push([field, val]);
      return chain;
    },
    _calls: calls,
  };
  return chain;
}

describe('applyPostPlatformAccountFilter', () => {
  it('returns query unchanged without platform/accountId', () => {
    const q = {};
    expect(applyPostPlatformAccountFilter(q, '', null)).toBe(q);
    expect(applyPostPlatformAccountFilter(q, 'facebook', '')).toBe(q);
  });

  it('maps facebook and google aliases', () => {
    let q = makeQuerySpy();
    q = applyPostPlatformAccountFilter(q, 'Facebook', 'p1');
    expect(q._calls).toEqual([['facebook_page_id', 'p1']]);

    q = makeQuerySpy();
    q = applyPostPlatformAccountFilter(q, 'google', 'locations/xyz');
    expect(q._calls).toEqual([['google_business_location_id', 'locations/xyz']]);
  });
});
