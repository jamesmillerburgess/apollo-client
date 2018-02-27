import {
  HeuristicFragmentMatcher,
  IntrospectionFragmentMatcher,
} from '../fragmentMatcher';
import { defaultNormalizedCacheFactory } from '../objectCache';

describe('HeuristicFragmentMatcher', () => {
  describe('ensureReady', () => {
    it('returns a Promise that resolves to nothing', async () => {
      const hfm = new HeuristicFragmentMatcher();
      await expect(hfm.ensureReady()).resolves.toEqual(void 0);
    });
  });

  describe('canBypassInit', () => {
    it('returns true', () => {
      const hfm = new HeuristicFragmentMatcher();
      expect(hfm.canBypassInit()).toBe(true);
    });
  });

  describe('match', () => {
    it('returns false if the object is not in the store', () => {
      const hfm = new HeuristicFragmentMatcher();
      const context = {
        store: {
          get: () => {},
        },
      };
      expect(hfm.match({}, '', context)).toBe(false);
    });

    it('it warns and flags returnPartialData if the store object has no __typename', () => {
      const hfm = new HeuristicFragmentMatcher();
      const context = {
        store: {
          get: () => ({}),
        },
      };
      const spy = jest.spyOn(console, 'warn');
      expect(hfm.match({}, '', context)).toBe(true);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(context.returnPartialData).toBe(true);
    });
  });
});

describe('IntrospectionFragmentMatcher', () => {
  it('will throw an error if match is called if it is not ready', () => {
    const ifm = new IntrospectionFragmentMatcher();
    expect(() => (ifm.match as any)()).toThrowError(/called before/);
  });

  it('can be seeded with an introspection query result', () => {
    const ifm = new IntrospectionFragmentMatcher({
      introspectionQueryResultData: {
        __schema: {
          types: [
            {
              kind: 'UNION',
              name: 'Item',
              possibleTypes: [
                {
                  name: 'ItemA',
                },
                {
                  name: 'ItemB',
                },
              ],
            },
          ],
        },
      },
    });

    const store = defaultNormalizedCacheFactory({
      a: {
        __typename: 'ItemB',
      },
    });

    const idValue = {
      type: 'id',
      id: 'a',
      generated: false,
    };

    const readStoreContext = {
      store,
      returnPartialData: false,
      hasMissingField: false,
      customResolvers: {},
    };

    expect(ifm.match(idValue as any, 'Item', readStoreContext)).toBe(true);
    expect(ifm.match(idValue as any, 'NotAnItem', readStoreContext)).toBe(
      false,
    );
  });

  it('ignores non-union, non-interface types', () => {
    const ifm = new IntrospectionFragmentMatcher({
      introspectionQueryResultData: {
        __schema: {
          types: [
            {
              kind: 'OTHER',
              name: 'Item',
              possibleTypes: [
                {
                  name: 'ItemA',
                },
                {
                  name: 'ItemB',
                },
              ],
            },
          ],
        },
      },
    });
    expect(ifm.possibleTypesMap).toEqual({});
  });

  describe('match', () => {
    it('returns false if the object is not in the store', () => {
      const ifm = new IntrospectionFragmentMatcher();
      const context = {
        store: {
          get: () => {},
        },
      };
      ifm.isReady = true;
      expect(ifm.match({}, '', context)).toBe(false);
    });

    it('throws if the store object has no __typename', () => {
      const ifm = new IntrospectionFragmentMatcher();
      const context = {
        store: {
          get: () => ({}),
        },
      };
      ifm.isReady = true;
      expect(() => ifm.match({}, '', context)).toThrowError(/Cannot match/);
    });
  });
});
