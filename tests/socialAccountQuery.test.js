const {
  applyFacebookAccountFilter,
  applyInstagramAccountFilter,
} = require('../src/services/socialAccountQuery');

function mockQuery() {
  return {
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
  };
}

describe('socialAccountQuery', () => {
  const postBase = { user_id: 'user-uuid-1' };

  describe('applyFacebookAccountFilter', () => {
    it('filters by facebook_account_id when set', () => {
      const q = mockQuery();
      const post = { ...postBase, facebook_account_id: 42 };
      const profile = { team_id: 99 };

      applyFacebookAccountFilter(q, post, profile);

      expect(q.eq).toHaveBeenCalledWith('id', 42);
      expect(q.or).not.toHaveBeenCalled();
    });

    it('uses team OR filter when no facebook_account_id and profile has team', () => {
      const q = mockQuery();
      const post = { ...postBase };
      const profile = { team_id: 7 };

      applyFacebookAccountFilter(q, post, profile);

      expect(q.or).toHaveBeenCalledWith(
        'user_id.eq.user-uuid-1,team_id.eq.7'
      );
      expect(q.eq).not.toHaveBeenCalledWith('id', expect.anything());
    });

    it('filters by user_id when solo user (no team)', () => {
      const q = mockQuery();
      const post = { ...postBase };
      const profile = { team_id: null };

      applyFacebookAccountFilter(q, post, profile);

      expect(q.eq).toHaveBeenCalledWith('user_id', 'user-uuid-1');
      expect(q.or).not.toHaveBeenCalled();
    });
  });

  describe('applyInstagramAccountFilter', () => {
    it('filters by instagram_account_id when set', () => {
      const q = mockQuery();
      const post = { ...postBase, instagram_account_id: 100 };
      const profile = { team_id: 1 };

      applyInstagramAccountFilter(q, post, profile);

      expect(q.eq).toHaveBeenCalledWith('id', 100);
    });

    it('uses team OR filter for Instagram when team member', () => {
      const q = mockQuery();
      const post = { ...postBase };
      const profile = { team_id: 3 };

      applyInstagramAccountFilter(q, post, profile);

      expect(q.or).toHaveBeenCalledWith(
        'user_id.eq.user-uuid-1,team_id.eq.3'
      );
    });
  });
});
