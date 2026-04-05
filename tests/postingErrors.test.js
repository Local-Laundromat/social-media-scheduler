const { normalizeAxiosGraphError } = require('../src/utils/postingErrors');

describe('normalizeAxiosGraphError', () => {
  it('extracts Meta Graph error fields from axios response', () => {
    const axiosLike = {
      message: 'Request failed',
      response: {
        status: 400,
        data: {
          error: {
            message: 'Invalid OAuth access token.',
            type: 'OAuthException',
            code: 190,
            error_subcode: 463,
            fbtrace_id: 'abc123',
          },
        },
      },
    };

    const g = normalizeAxiosGraphError(axiosLike);
    expect(g.message).toBe('Invalid OAuth access token.');
    expect(g.code).toBe(190);
    expect(g.error_subcode).toBe(463);
    expect(g.type).toBe('OAuthException');
    expect(g.fbtrace_id).toBe('abc123');
    expect(g.httpStatus).toBe(400);
    expect(g.isNetwork).toBe(false);
  });

  it('falls back to Error.message when no response body', () => {
    const g = normalizeAxiosGraphError(new Error('ECONNRESET'));
    expect(g.message).toBe('ECONNRESET');
    expect(g.isNetwork).toBe(false);
  });
});
