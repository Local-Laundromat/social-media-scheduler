const path = require('path');
const os = require('os');
const fs = require('fs');

jest.mock('axios');
const axios = require('axios');

const FacebookService = require('../src/services/facebook');
const { isRemoteMediaUrl, inferMediaExtension } = require('../src/services/facebook');

describe('isRemoteMediaUrl', () => {
  it('returns true for https URLs', () => {
    expect(isRemoteMediaUrl('https://cdn.example.com/bucket/file.jpg')).toBe(true);
  });

  it('returns true for http URLs', () => {
    expect(isRemoteMediaUrl('http://localhost/uploads/x.png')).toBe(true);
  });

  it('returns false for absolute filesystem paths', () => {
    expect(isRemoteMediaUrl('/var/app/uploads/a.jpg')).toBe(false);
  });

  it('returns false for relative paths', () => {
    expect(isRemoteMediaUrl('uploads/a.jpg')).toBe(false);
  });

  it('trims whitespace before checking', () => {
    expect(isRemoteMediaUrl('  https://a.com/x.jpg  ')).toBe(true);
  });
});

describe('inferMediaExtension', () => {
  it('uses pathname only for https URLs (query no longer breaks .jpg)', () => {
    expect(inferMediaExtension('https://cdn.example.com/bucket/photo.jpg?v=1&token=abc')).toBe('.jpg');
  });

  it('falls back to filename hint when URL has no extension', () => {
    expect(
      inferMediaExtension('https://x.supabase.co/storage/v1/object/public/bucket/uuid', {
        filename: '1734567890-shot.png',
      })
    ).toBe('.png');
  });

  it('uses filetype when path has no extension', () => {
    expect(inferMediaExtension('https://x.com/y/z', { filetype: 'image' })).toBe('.jpg');
    expect(inferMediaExtension('https://x.com/y/z', { filetype: 'video' })).toBe('.mp4');
  });
});

describe('FacebookService', () => {
  let tmpFile;

  beforeAll(() => {
    tmpFile = path.join(os.tmpdir(), `jest-fb-${Date.now()}.jpg`);
    fs.writeFileSync(tmpFile, Buffer.from([0xff, 0xd8, 0xff]));
  });

  afterAll(() => {
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {
      /* ignore */
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('postImage uses Graph url param for remote https images', async () => {
    axios.post.mockResolvedValue({
      data: { id: 'photo123', post_id: 'story456' },
    });

    const fb = new FacebookService('page-token', 'page-id-1');
    const url = 'https://storage.example.com/quu-media/123-photo.jpg';

    const result = await fb.postImage(url, 'hello');

    expect(result.success).toBe(true);
    expect(result.postId).toBe('story456');
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [endpoint, body, config] = axios.post.mock.calls[0];
    expect(endpoint).toContain('/page-id-1/photos');
    expect(body).toBeNull();
    expect(config.params.url).toBe(url);
    expect(config.params.message).toBe('hello');
    expect(config.params.access_token).toBe('page-token');
  });

  it('postImage uses multipart for local file paths', async () => {
    axios.post.mockResolvedValue({
      data: { id: 'photo789', post_id: 'story000' },
    });

    const fb = new FacebookService('tok', 'pid');
    const result = await fb.postImage(tmpFile, 'caption');

    expect(result.success).toBe(true);
    const [, body] = axios.post.mock.calls[0];
    expect(body).not.toBeNull();
    expect(typeof body.getHeaders).toBe('function');
  });

  it('post routes jpg extension on URL to postImage', async () => {
    axios.post.mockResolvedValue({ data: { id: '1', post_id: '2' } });
    const fb = new FacebookService('t', 'p');
    await fb.post('https://cdn.com/img.jpg', 'c');
    expect(axios.post.mock.calls[0][2].params.url).toBe('https://cdn.com/img.jpg');
  });

  it('post routes jpg URL with query string to postImage (Graph url param)', async () => {
    axios.post.mockResolvedValue({ data: { id: '1', post_id: '2' } });
    const fb = new FacebookService('t', 'p');
    const url = 'https://cdn.com/storage/x.jpg?v=1';
    await fb.post(url, 'c');
    expect(axios.post.mock.calls[0][2].params.url).toBe(url);
  });
});
