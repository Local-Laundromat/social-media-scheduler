/**
 * Team Management Module
 * Handles team creation, invitations, member management
 */

class TeamManager {
  constructor() {
    this.currentTeam = null;
    this.currentUser = null;
    this.members = [];
    this.invitations = [];
  }

  /**
   * Initialize team management
   */
  async init(user) {
    this.currentUser = user;
    await this.loadTeamData();
    this.setupEventListeners();
  }

  /**
   * Load current team data
   */
  async loadTeamData() {
    try {
      const token = localStorage.getItem('auth_token');

      // Load user's teams
      const teamsResponse = await fetch('/api/teams', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!teamsResponse.ok) {
        this.renderNoTeam();
        return;
      }

      const teamsData = await teamsResponse.json();
      const teams = teamsData.teams || [];

      if (teams.length === 0) {
        this.renderNoTeam();
        return;
      }

      // Sort by creation date (newest first) and use the most recent team
      teams.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const selectedTeam = teams[0];

      // Load full team details including members
      const teamDetailsResponse = await fetch(`/api/teams/${selectedTeam.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!teamDetailsResponse.ok) {
        this.renderNoTeam();
        return;
      }

      const teamDetails = await teamDetailsResponse.json();
      this.currentTeam = teamDetails.team;
      this.members = teamDetails.members || [];
      this.invitations = teamDetails.invitations || [];

      this.renderTeamUI();
    } catch (error) {
      console.error('Error loading team data:', error);
      this.renderNoTeam();
    }
  }

  /**
   * Load pending invitations
   * Note: This is now handled in loadTeamData() but kept for backwards compatibility
   */
  async loadInvitations() {
    // Invitations are now loaded as part of team details in loadTeamData()
    // This method is kept for backwards compatibility but does nothing
  }

  /**
   * Check if current user can manage team
   */
  canManageTeam() {
    if (!this.currentTeam || !this.currentUser) return false;
    const member = this.members.find(m => m.user_id === this.currentUser.id);
    return member && (member.role === 'owner' || member.role === 'admin');
  }

  /**
   * Check if current user is owner
   */
  isOwner() {
    if (!this.currentTeam || !this.currentUser) return false;
    return this.currentTeam.owner_id === this.currentUser.id;
  }

  /**
   * Render team UI
   */
  renderTeamUI() {
    const container = document.getElementById('teamTabContent');
    if (!container) return;

    const canManage = this.canManageTeam();
    const isOwner = this.isOwner();

    container.innerHTML = `
      <div style="max-width: 900px;">
        <!-- Team Header -->
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 24px; border-radius: 12px; margin-bottom: 24px; color: white;">
          <h3 style="margin-bottom: 8px; color: white;">${this.escapeHtml(this.currentTeam.name)}</h3>
          <p style="opacity: 0.9; margin-bottom: 16px;">${this.currentTeam.description || 'Team workspace for collaboration'}</p>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 13px;">
              ${this.members.length} member${this.members.length !== 1 ? 's' : ''}
            </span>
            ${isOwner ? '<span style="background: rgba(250,204,21,0.3); padding: 4px 12px; border-radius: 20px; font-size: 13px;">👑 Team Owner</span>' : ''}
            ${!isOwner && canManage ? '<span style="background: rgba(34,197,94,0.3); padding: 4px 12px; border-radius: 20px; font-size: 13px;">🛡️ Admin</span>' : ''}
          </div>
        </div>

        <!-- Team Members -->
        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="margin: 0;">Team Members</h4>
            ${canManage ? '<button id="inviteMemberBtn" style="background: #6366f1; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">+ Invite Member</button>' : ''}
          </div>
          <div id="teamMembersList" style="display: grid; gap: 12px;">
            ${this.renderMembers()}
          </div>
        </div>

        <!-- Pending Invitations (Owner/Admin only) -->
        ${canManage && this.invitations.length > 0 ? `
          <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h4 style="margin-bottom: 16px;">Pending Invitations</h4>
            <div style="display: grid; gap: 12px;">
              ${this.renderInvitations()}
            </div>
          </div>
        ` : ''}

        <!-- Team Settings (Owner only) -->
        ${isOwner ? `
          <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h4 style="margin-bottom: 16px;">Team Settings</h4>
            <div style="display: grid; gap: 16px;">
              <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Team Name</label>
                <input type="text" id="teamNameInput" value="${this.escapeHtml(this.currentTeam.name)}" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
              </div>
              <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Description</label>
                <textarea id="teamDescriptionInput" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; min-height: 80px;">${this.escapeHtml(this.currentTeam.description || '')}</textarea>
              </div>
              <div style="display: flex; gap: 12px;">
                <button id="updateTeamBtn" style="background: #6366f1; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Save Changes</button>
                <button id="deleteTeamBtn" style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Delete Team</button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Leave Team (Non-owners) -->
        ${!isOwner ? `
          <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h4 style="margin-bottom: 12px; color: #ef4444;">Leave Team</h4>
            <p style="margin-bottom: 16px; color: #6b7280; font-size: 14px;">Once you leave, you'll lose access to all team content and posts.</p>
            <button id="leaveTeamBtn" style="background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Leave Team</button>
          </div>
        ` : ''}
      </div>

      <!-- Invite Member Modal -->
      <div id="inviteModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
        <div style="background: white; padding: 32px; border-radius: 12px; max-width: 500px; width: 90%;">
          <h3 style="margin-bottom: 20px;">Invite Team Member</h3>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Email Address</label>
            <input type="email" id="inviteEmailInput" placeholder="teammate@example.com" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
          </div>
          <div style="margin-bottom: 24px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Role</label>
            <select id="inviteRoleSelect" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
              <option value="member">Member - Can create and manage posts</option>
              <option value="admin">Admin - Can invite members and manage team</option>
            </select>
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cancelInviteBtn" style="background: #f3f4f6; border: 1px solid #d1d5db; color: #1f2937; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Cancel</button>
            <button id="sendInviteBtn" style="background: #6366f1; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Send Invitation</button>
          </div>
        </div>
      </div>
    `;

    this.attachEventHandlers();
  }

  /**
   * Render no team UI
   */
  renderNoTeam() {
    const container = document.getElementById('teamTabContent');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto; text-align: center; padding: 48px 24px;">
        <div style="font-size: 64px; margin-bottom: 24px;">👥</div>
        <h3 style="margin-bottom: 16px;">No Team Yet</h3>
        <p style="color: #6b7280; margin-bottom: 32px;">Create a team to collaborate with others on social media management.</p>
        <button id="createTeamBtn" style="background: #6366f1; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500;">Create Team</button>
      </div>

      <!-- Create Team Modal -->
      <div id="createTeamModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
        <div style="background: white; padding: 32px; border-radius: 12px; max-width: 500px; width: 90%;">
          <h3 style="margin-bottom: 20px;">Create Team</h3>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Team Name</label>
            <input type="text" id="newTeamNameInput" placeholder="My Awesome Team" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
          </div>
          <div style="margin-bottom: 24px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Description (Optional)</label>
            <textarea id="newTeamDescriptionInput" placeholder="What's your team about?" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; min-height: 80px;"></textarea>
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cancelCreateTeamBtn" style="background: #f3f4f6; border: 1px solid #d1d5db; color: #1f2937; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Cancel</button>
            <button id="confirmCreateTeamBtn" style="background: #6366f1; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Create Team</button>
          </div>
        </div>
      </div>
    `;

    this.attachNoTeamHandlers();
  }

  /**
   * Render team members list
   */
  renderMembers() {
    return this.members.map(member => {
      const isCurrentUser = member.user_id === this.currentUser?.id;
      const canRemove = this.canManageTeam() && !isCurrentUser && member.role !== 'owner';
      const canChangeRole = this.isOwner() && !isCurrentUser && member.role !== 'owner';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f9fafb; border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #4f46e5); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px;">
              ${this.getInitials(member.name || member.email)}
            </div>
            <div>
              <div style="font-weight: 500;">${this.escapeHtml(member.name || 'Unnamed User')} ${isCurrentUser ? '<span style="color: #6366f1; font-size: 13px;">(You)</span>' : ''}</div>
              <div style="font-size: 13px; color: #6b7280;">${this.escapeHtml(member.email)}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${canChangeRole ? `
              <select data-user-id="${member.user_id}" class="change-role-select" style="padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
                <option value="member" ${member.role === 'member' ? 'selected' : ''}>Member</option>
                <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            ` : `
              <span style="padding: 4px 12px; background: ${this.getRoleBadgeColor(member.role)}; color: ${this.getRoleTextColor(member.role)}; border-radius: 20px; font-size: 12px; font-weight: 500;">
                ${this.getRoleLabel(member.role)}
              </span>
            `}
            ${canRemove ? `
              <button data-user-id="${member.user_id}" class="remove-member-btn" style="background: #fee2e2; color: #991b1b; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Remove</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render pending invitations
   */
  renderInvitations() {
    return this.invitations.map(invite => {
      const isExpired = new Date(invite.expires_at) < new Date();

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px;">
          <div>
            <div style="font-weight: 500;">${this.escapeHtml(invite.email)}</div>
            <div style="font-size: 13px; color: #92400e;">
              ${this.getRoleLabel(invite.role)} •
              ${isExpired ? '<span style="color: #dc2626;">Expired</span>' : `Expires ${this.formatRelativeTime(invite.expires_at)}`}
            </div>
          </div>
          <button data-invite-id="${invite.id}" class="cancel-invite-btn" style="background: #fee2e2; color: #991b1b; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Cancel</button>
        </div>
      `;
    }).join('');
  }

  /**
   * Setup event listeners for no team state
   */
  attachNoTeamHandlers() {
    const createBtn = document.getElementById('createTeamBtn');
    const modal = document.getElementById('createTeamModal');
    const cancelBtn = document.getElementById('cancelCreateTeamBtn');
    const confirmBtn = document.getElementById('confirmCreateTeamBtn');

    if (createBtn) {
      createBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.createTeam());
    }
  }

  /**
   * Attach event handlers
   */
  attachEventHandlers() {
    // Invite member
    const inviteBtn = document.getElementById('inviteMemberBtn');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => {
        document.getElementById('inviteModal').style.display = 'flex';
      });
    }

    // Cancel invite modal
    const cancelInviteBtn = document.getElementById('cancelInviteBtn');
    if (cancelInviteBtn) {
      cancelInviteBtn.addEventListener('click', () => {
        document.getElementById('inviteModal').style.display = 'none';
      });
    }

    // Send invitation
    const sendInviteBtn = document.getElementById('sendInviteBtn');
    if (sendInviteBtn) {
      sendInviteBtn.addEventListener('click', () => this.sendInvitation());
    }

    // Update team
    const updateTeamBtn = document.getElementById('updateTeamBtn');
    if (updateTeamBtn) {
      updateTeamBtn.addEventListener('click', () => this.updateTeam());
    }

    // Delete team
    const deleteTeamBtn = document.getElementById('deleteTeamBtn');
    if (deleteTeamBtn) {
      deleteTeamBtn.addEventListener('click', () => this.deleteTeam());
    }

    // Leave team
    const leaveTeamBtn = document.getElementById('leaveTeamBtn');
    if (leaveTeamBtn) {
      leaveTeamBtn.addEventListener('click', () => this.leaveTeam());
    }

    // Remove member buttons
    document.querySelectorAll('.remove-member-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.getAttribute('data-user-id');
        this.removeMember(userId);
      });
    });

    // Change role selects
    document.querySelectorAll('.change-role-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const userId = e.target.getAttribute('data-user-id');
        const newRole = e.target.value;
        this.changeRole(userId, newRole);
      });
    });

    // Cancel invitation buttons
    document.querySelectorAll('.cancel-invite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const inviteId = e.target.getAttribute('data-invite-id');
        this.cancelInvitation(inviteId);
      });
    });
  }

  /**
   * Setup general event listeners
   */
  setupEventListeners() {
    // Check for invitation token in URL (accept invite flow)
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');

    if (inviteToken) {
      this.acceptInvitation(inviteToken);
    }
  }

  /**
   * Create new team
   */
  async createTeam() {
    const name = document.getElementById('newTeamNameInput').value.trim();
    const description = document.getElementById('newTeamDescriptionInput').value.trim();

    if (!name) {
      this.showError('Please enter a team name');
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, description })
      });

      if (response.ok) {
        this.showSuccess('Team created successfully!');
        document.getElementById('createTeamModal').style.display = 'none';
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to create team');
      }
    } catch (error) {
      console.error('Error creating team:', error);
      this.showError('Failed to create team');
    }
  }

  /**
   * Send invitation
   */
  async sendInvitation() {
    const email = document.getElementById('inviteEmailInput').value.trim();
    const role = document.getElementById('inviteRoleSelect').value;

    if (!email) {
      this.showError('Please enter an email address');
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/teams/${this.currentTeam.id}/invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, role })
      });

      if (response.ok) {
        this.showSuccess('Invitation sent successfully!');
        document.getElementById('inviteModal').style.display = 'none';
        document.getElementById('inviteEmailInput').value = '';
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      this.showError('Failed to send invitation');
    }
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(token) {
    try {
      const authToken = localStorage.getItem('auth_token');
      const response = await fetch('/api/teams/accept-invite', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      if (response.ok) {
        this.showSuccess('You have joined the team!');
        // Remove token from URL
        window.history.replaceState({}, document.title, window.location.pathname);
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to accept invitation');
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      this.showError('Failed to accept invitation');
    }
  }

  /**
   * Update team
   */
  async updateTeam() {
    const name = document.getElementById('teamNameInput').value.trim();
    const description = document.getElementById('teamDescriptionInput').value.trim();

    if (!name) {
      this.showError('Team name cannot be empty');
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/teams/${this.currentTeam.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, description })
      });

      if (response.ok) {
        this.showSuccess('Team updated successfully!');
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to update team');
      }
    } catch (error) {
      console.error('Error updating team:', error);
      this.showError('Failed to update team');
    }
  }

  /**
   * Delete team
   */
  async deleteTeam() {
    if (!confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/teams/${this.currentTeam.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        this.showSuccess('Team deleted successfully');
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to delete team');
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      this.showError('Failed to delete team');
    }
  }

  /**
   * Leave team
   */
  async leaveTeam() {
    if (!confirm('Are you sure you want to leave this team?')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/teams/${this.currentTeam.id}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        this.showSuccess('You have left the team');
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to leave team');
      }
    } catch (error) {
      console.error('Error leaving team:', error);
      this.showError('Failed to leave team');
    }
  }

  /**
   * Remove member
   */
  async removeMember(userId) {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/teams/${this.currentTeam.id}/members/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        this.showSuccess('Member removed successfully');
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      this.showError('Failed to remove member');
    }
  }

  /**
   * Change member role
   */
  async changeRole(userId, newRole) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/teams/${this.currentTeam.id}/members/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        this.showSuccess('Role updated successfully');
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error changing role:', error);
      this.showError('Failed to update role');
    }
  }

  /**
   * Cancel invitation
   */
  async cancelInvitation(inviteId) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/teams/${this.currentTeam.id}/invitations/${inviteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        this.showSuccess('Invitation canceled');
        await this.loadTeamData();
      } else {
        const error = await response.json();
        this.showError(error.error || 'Failed to cancel invitation');
      }
    } catch (error) {
      console.error('Error canceling invitation:', error);
      this.showError('Failed to cancel invitation');
    }
  }

  // Helper methods
  getInitials(nameOrEmail) {
    // Handle null/undefined/empty values
    if (!nameOrEmail || typeof nameOrEmail !== 'string') {
      return '??';
    }

    const parts = nameOrEmail.split(/[\s@]/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    // Return first 2 characters or pad with ?
    const initials = nameOrEmail.substring(0, 2).toUpperCase();
    return initials.length === 2 ? initials : initials + '?';
  }

  getRoleLabel(role) {
    const labels = {
      owner: '👑 Owner',
      admin: '🛡️ Admin',
      member: '👤 Member'
    };
    return labels[role] || role;
  }

  getRoleBadgeColor(role) {
    const colors = {
      owner: '#fef3c7',
      admin: '#d1fae5',
      member: '#e0e7ff'
    };
    return colors[role] || '#f3f4f6';
  }

  getRoleTextColor(role) {
    const colors = {
      owner: '#92400e',
      admin: '#065f46',
      member: '#3730a3'
    };
    return colors[role] || '#1f2937';
  }

  formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays > 1) return `in ${diffDays} days`;
    return 'expired';
  }

  escapeHtml(text) {
    if (!text && text !== 0) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  showSuccess(message) {
    if (window.notifySuccess) {
      window.notifySuccess(message);
    } else {
      alert(message);
    }
  }

  showError(message) {
    if (window.notifyError) {
      window.notifyError(message);
    } else {
      alert(message);
    }
  }
}

// Export for use in dashboard
window.TeamManager = TeamManager;
