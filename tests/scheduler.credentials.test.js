jest.mock('../src/database/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
  getPostById: jest.fn(),
  updatePost: jest.fn(),
}));

const { supabase } = require('../src/database/supabase');
const { Scheduler } = require('../src/services/scheduler');

describe('Scheduler.getCredentials', () => {
  let scheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new Scheduler();
  });

  it('returns env-based tokens when post has no user_id or account_id', async () => {
    const prevFb = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const prevPid = process.env.FACEBOOK_PAGE_ID;
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'env-fb-token';
    process.env.FACEBOOK_PAGE_ID = 'env-page';

    try {
      const creds = await scheduler.getCredentials({});
      expect(creds.source).toBe('env');
      expect(creds.facebookToken).toBe('env-fb-token');
      expect(creds.facebookPageId).toBe('env-page');
    } finally {
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN = prevFb;
      process.env.FACEBOOK_PAGE_ID = prevPid;
    }
  });

  it('throws when user_id set but profile missing', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        };
      }
      return {};
    });

    await expect(
      scheduler.getCredentials({ user_id: 'missing-user' })
    ).rejects.toThrow('User profile not found');
  });

  it('loads Facebook row for user when profile exists', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: 'u1',
                    name: 'N',
                    team_id: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'facebook_accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [
                      {
                        access_token: 'fb-tok',
                        page_id: 'page-99',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === 'instagram_accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () =>
                  Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const creds = await scheduler.getCredentials({ user_id: 'u1' });

    expect(creds.source).toBe('user');
    expect(creds.facebookToken).toBe('fb-tok');
    expect(creds.facebookPageId).toBe('page-99');
    expect(creds.userName).toBe('N');
  });
});
