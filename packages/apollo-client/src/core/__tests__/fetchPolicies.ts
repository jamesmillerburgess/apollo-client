import { cloneDeep, assign } from 'lodash';
import { GraphQLError, ExecutionResult, DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { print } from 'graphql/language/printer';
import { ApolloLink, Observable } from 'apollo-link';
import {
  InMemoryCache,
  IntrospectionFragmentMatcher,
  FragmentMatcherInterface,
} from 'apollo-cache-inmemory';

import { QueryManager } from '../QueryManager';
import { WatchQueryOptions } from '../watchQueryOptions';

import { ApolloError } from '../../errors/ApolloError';

import ApolloClient, { printAST } from '../..';

import subscribeAndCount from '../../util/subscribeAndCount';
import { withWarning } from '../../util/wrap';

import { mockSingleLink } from '../../__mocks__/mockLinks';

const query = gql`
  query {
    author {
      __typename
      id
      firstName
      lastName
    }
  }
`;

const result = {
  author: {
    __typename: 'Author',
    id: 1,
    firstName: 'John',
    lastName: 'Smith',
  },
};

const mutation = gql`
  mutation updateName($id: ID!, $firstName: String!) {
    updateName(id: $id, firstName: $firstName) {
      __typename
      id
      firstName
    }
  }
`;

const variables = {
  id: 1,
  firstName: 'James',
};

const mutationResult = {
  updateName: {
    id: 1,
    __typename: 'Author',
    firstName: 'James',
  },
};

const merged = { author: { ...result.author, firstName: 'James' } };

const createLink = () =>
  mockSingleLink(
    {
      request: { query },
      result: { data: result },
    },
    {
      request: { query },
      result: { data: result },
    },
  );

const createFailureLink = () =>
  mockSingleLink(
    {
      request: { query },
      error: new Error('query failed'),
    },
    {
      request: { query },
      result: { data: result },
    },
  );

const createMutationLink = () =>
  // fetch the data
  mockSingleLink(
    {
      request: { query },
      result: { data: result },
    },
    // update the data
    {
      request: { query: mutation, variables },
      result: { data: mutationResult },
    },
    // get the new results
    {
      request: { query },
      result: { data: merged },
    },
  );

describe('network-only', () => {
  it('requests from the network even if already in cache', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    return client.query({ query }).then(() =>
      client
        .query({ fetchPolicy: 'network-only', query })
        .then(actualResult => {
          expect(actualResult.data).toEqual(result);
          expect(called).toBe(4);
        }),
    );
  });
  it('saves data to the cache on success', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    return client.query({ query, fetchPolicy: 'network-only' }).then(() =>
      client.query({ query }).then(actualResult => {
        expect(actualResult.data).toEqual(result);
        expect(called).toBe(2);
      }),
    );
  });
  it('does not save data to the cache on failure', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createFailureLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    let didFail = false;
    return client
      .query({ query, fetchPolicy: 'network-only' })
      .catch(e => {
        expect(e.message).toMatch('query failed');
        didFail = true;
      })
      .then(() =>
        client.query({ query }).then(actualResult => {
          expect(actualResult.data).toEqual(result);
          // the first error doesn't call .map on the inspector
          expect(called).toBe(3);
          expect(didFail).toBe(true);
        }),
      );
  });

  it('updates the cache on a mutation', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createMutationLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    return client
      .query({ query })
      .then(() =>
        // XXX currently only no-cache is supported as a fetchPolicy
        // this mainly serves to ensure the cache is updated correctly
        client.mutate({ mutation, variables }),
      )
      .then(() => {
        return client.query({ query }).then(actualResult => {
          expect(actualResult.data).toEqual(merged);
        });
      });
  });
});
describe('no-cache', () => {
  it('requests from the network even if already in cache', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    return client.query({ query }).then(() =>
      client.query({ fetchPolicy: 'no-cache', query }).then(actualResult => {
        expect(actualResult.data).toEqual(result);
        expect(called).toBe(4);
      }),
    );
  });
  it('does not save the data to the cache on success', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    return client.query({ query, fetchPolicy: 'no-cache' }).then(() =>
      client.query({ query }).then(actualResult => {
        expect(actualResult.data).toEqual(result);
        // the second query couldn't read anything from the cache
        expect(called).toBe(4);
      }),
    );
  });

  it('does not save data to the cache on failure', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createFailureLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    let didFail = false;
    return client
      .query({ query, fetchPolicy: 'no-cache' })
      .catch(e => {
        expect(e.message).toMatch('query failed');
        didFail = true;
      })
      .then(() =>
        client.query({ query }).then(actualResult => {
          expect(actualResult.data).toEqual(result);
          // the first error doesn't call .map on the inspector
          expect(called).toBe(3);
          expect(didFail).toBe(true);
        }),
      );
  });
  it('does not update the cache on a mutation', () => {
    let called = 0;
    const inspector = new ApolloLink((operation, forward) => {
      called++;
      return forward(operation).map(result => {
        called++;
        return result;
      });
    });

    const client = new ApolloClient({
      link: inspector.concat(createMutationLink()),
      cache: new InMemoryCache({ addTypename: false }),
    });

    return client
      .query({ query })
      .then(() =>
        client.mutate({ mutation, variables, fetchPolicy: 'no-cache' }),
      )
      .then(() => {
        return client.query({ query }).then(actualResult => {
          expect(actualResult.data).toEqual(result);
        });
      });
  });
});
