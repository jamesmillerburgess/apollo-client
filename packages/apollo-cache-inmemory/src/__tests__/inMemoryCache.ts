import gql from 'graphql-tag';

import * as imc from '../inMemoryCache';

describe('defaultDataIdFromObject', () => {
  const { defaultDataIdFromObject } = imc;

  it('combines __typename with id or _id', () => {
    expect(defaultDataIdFromObject({ __typename: 'a', id: 'b' })).toBe('a:b');
    expect(defaultDataIdFromObject({ __typename: 'a', _id: 'c' })).toBe('a:c');
    expect(defaultDataIdFromObject({ __typename: 'a', _id: 'c' })).toBe('a:c');
    expect(defaultDataIdFromObject({ __typename: 'a' })).toBe(null);
    expect(defaultDataIdFromObject({ id: 'b', _id: 'c' })).toBe(null);
  });
});

describe('InMemoryCache', () => {
  const { InMemoryCache, defaultConfig } = imc;

  describe('constructor', () => {
    it('defaults config to an empty object', () => {
      const test = new InMemoryCache();
      expect(test.config).toEqual(defaultConfig);
    });

    it('warns on use of deprecated properties', () => {
      const spy = jest.spyOn(console, 'warn');
      const config = {
        customResolvers: true,
        cacheResolvers: true,
        storeFactory: () => {},
      };
      const test = new InMemoryCache(config);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('restore', () => {
    it('calls replace on the data only if data is passed', () => {
      const replace = jest.fn();
      const config = {
        storeFactory: () => ({ replace }),
      };
      const test = new InMemoryCache(config);
      test.restore();
      expect(replace).not.toBeCalled();
      test.restore('a');
      expect(replace).toBeCalled();
    });
  });

  describe('watch', () => {
    it('pushes the watch and returns a function that removes the watch', () => {
      const test = new InMemoryCache();
      expect(test.watches).toEqual([]);
      const removeA = test.watch('a');
      expect(test.watches).toEqual(['a']);
      const removeB = test.watch('b');
      expect(test.watches).toEqual(['a', 'b']);
      removeB();
      expect(test.watches).toEqual(['a']);
      removeA();
      expect(test.watches).toEqual([]);
    });
  });

  describe('evict', () => {
    it('throws an error', () => {
      const test = new InMemoryCache();
      expect(test.evict).toThrowError(
        'Eviction is not implemented on InMemoryCache',
      );
    });
  });

  describe('reset', () => {
    it('calls clear on data, calls broadcastWatches, and returns a Promise that resolves to undefined', async () => {
      const clear = jest.fn();
      const config = {
        storeFactory: () => ({ clear }),
      };
      const test = new InMemoryCache(config);
      const broadcastWatches = jest.spyOn(test, 'broadcastWatches');
      const promise = test.reset();
      expect(clear).toBeCalled();
      expect(broadcastWatches).toBeCalled();
      await expect(promise).resolves.toBe(undefined);
    });
  });

  describe('removeOptimistic', () => {
    it('clears optimistic and reruns data actions before calling broadcastWatches', () => {
      const test = new InMemoryCache();
      test.optimistic = [
        { id: 'a' },
        { id: 'b', transaction: () => {} },
        { id: 'c', transaction: () => {} },
      ];
      const recordOptimisticTransaction = jest.spyOn(
        test,
        'recordOptimisticTransaction',
      );
      const broadcastWatches = jest.spyOn(test, 'broadcastWatches');
      test.removeOptimistic('a');
      expect(test.optimistic.length).toBe(2);
      expect(recordOptimisticTransaction).toHaveBeenCalledTimes(2);
      expect(broadcastWatches).toHaveBeenCalledTimes(5);
    });
  });

  describe('readQuery', () => {
    it('defaults optimistic to false', () => {
      const test = new InMemoryCache();
      test.read = ({ optimistic }) => optimistic;
      expect(test.readQuery({})).toBe(false);
      expect(test.readQuery({}, true)).toBe(true);
    });
  });

  describe('readFragment', () => {
    it('defaults optimistic to false', () => {
      const test = new InMemoryCache();
      test.read = ({ optimistic }) => optimistic;
      const options = {
        fragment: gql`
          fragment a on b {
            name
          }
        `,
        fragmentName: 'a',
      };
      expect(test.readFragment(options)).toBe(false);
      expect(test.readFragment(options, true)).toBe(true);
    });
  });

  describe('broadcastWatches', () => {
    it('passes the result of previousResult into diff, if available', () => {
      const test = new InMemoryCache();
      const previousResult = jest.fn();
      const callback = jest.fn();
      test.watches = [{ previousResult, callback }, { callback }];
      test.diff = jest.fn();
      test.broadcastWatches();
      expect(test.diff).toHaveBeenCalledTimes(2);
      expect(previousResult).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });
});
