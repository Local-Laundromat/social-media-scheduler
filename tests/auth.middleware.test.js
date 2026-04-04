const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: (...args) => mockGetUser(...args),
    },
  })),
}));

jest.mock('../src/database/supabase', () => ({
  supabase: {},
  getProfileById: jest.fn(),
}));

const { getProfileById } = require('../src/database/supabase');
const {
  authenticateSupabase,
  optionalSupabaseAuth,
  requireRole,
} = require('../src/middleware/auth');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('authenticateSupabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await authenticateSupabase(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'bad' },
    });

    const req = { headers: { authorization: 'Bearer bad' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticateSupabase(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets req when token is valid', async () => {
    const user = { id: 'auth-user-id', email: 'a@b.com' };
    mockGetUser.mockResolvedValue({
      data: { user },
      error: null,
    });
    getProfileById.mockResolvedValue({
      id: 'auth-user-id',
      team_id: 5,
      role: 'owner',
      name: 'Test',
    });

    const req = { headers: { authorization: 'Bearer valid.jwt' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticateSupabase(req, res, next);

    expect(req.userId).toBe('auth-user-id');
    expect(req.user).toEqual(user);
    expect(req.teamId).toBe(5);
    expect(req.userRole).toBe('owner');
    expect(next).toHaveBeenCalled();
  });
});

describe('optionalSupabaseAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls next without user when no token', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await optionalSupabaseAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });

  it('attaches user when token is valid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u2' } },
      error: null,
    });
    getProfileById.mockResolvedValue({ team_id: null, role: 'member' });

    const req = { headers: { authorization: 'Bearer t' } };
    const next = jest.fn();

    await optionalSupabaseAuth(req, mockRes(), next);

    expect(req.userId).toBe('u2');
    expect(next).toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('allows when role matches', () => {
    const middleware = requireRole(['owner', 'admin']);
    const req = { userRole: 'owner' };
    const next = jest.fn();

    middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  it('blocks when role missing', () => {
    const middleware = requireRole(['owner']);
    const res = mockRes();

    middleware({}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
