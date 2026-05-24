/**
 * Hashtag Suggestions Feature
 * AI-powered hashtag recommendations
 */

// Add hashtag suggestion button and UI to the post creation form
document.addEventListener('DOMContentLoaded', function() {
  initHashtagSuggestions();
});

function initHashtagSuggestions() {
  // Find the caption textarea
  const captionTextarea = document.getElementById('caption');
  if (!captionTextarea) return;

  // Create hashtag suggestion button
  const hashtagBtn = document.createElement('button');
  hashtagBtn.type = 'button';
  hashtagBtn.className = 'btn btn-secondary';
  hashtagBtn.id = 'getHashtagsBtn';
  hashtagBtn.innerHTML = '🏷️ Get Hashtag Suggestions';
  hashtagBtn.style.cssText = 'margin-top: 8px; margin-bottom: 12px;';

  // Insert button after caption textarea
  captionTextarea.parentNode.insertBefore(hashtagBtn, captionTextarea.nextSibling);

  // Create hashtag results container
  const hashtagContainer = document.createElement('div');
  hashtagContainer.id = 'hashtagSuggestions';
  hashtagContainer.style.cssText = 'display: none; margin-top: 12px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;';
  hashtagBtn.parentNode.insertBefore(hashtagContainer, hashtagBtn.nextSibling);

  // Add click handler
  hashtagBtn.addEventListener('click', getHashtagSuggestions);
}

async function getHashtagSuggestions() {
  const captionTextarea = document.getElementById('caption');
  const hashtagContainer = document.getElementById('hashtagSuggestions');
  const hashtagBtn = document.getElementById('getHashtagsBtn');

  const caption = captionTextarea.value.trim();

  if (!caption) {
    showNotification('Please enter a caption first', 'error');
    return;
  }

  // Get selected platforms
  const platforms = [];
  document.querySelectorAll('input[name="platforms"]:checked').forEach(cb => {
    platforms.push(cb.value);
  });

  // Default to instagram if no platform selected
  const platform = platforms.length > 0 ? platforms[0] : 'instagram';

  // Show loading state
  hashtagBtn.disabled = true;
  hashtagBtn.innerHTML = '⏳ Getting suggestions...';

  try {
    const token = localStorage.getItem('sb-access-token');
    const response = await fetch('/api/hashtags/suggest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        caption,
        platform,
        count: 15
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get hashtag suggestions');
    }

    const data = await response.json();

    // Display hashtags
    displayHashtags(data);

    // Show container
    hashtagContainer.style.display = 'block';

    showNotification(`Generated ${data.raw.length} hashtag suggestions!`, 'success');

  } catch (error) {
    console.error('Error getting hashtags:', error);
    showNotification('Failed to generate hashtags. Make sure OpenAI API key is configured.', 'error');
  } finally {
    hashtagBtn.disabled = false;
    hashtagBtn.innerHTML = '🏷️ Get Hashtag Suggestions';
  }
}

function displayHashtags(data) {
  const container = document.getElementById('hashtagSuggestions');

  let html = `
    <div style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="margin: 0; font-size: 16px; font-weight: 600;">Hashtag Suggestions for ${data.platform}</h4>
        <button type="button" onclick="addAllHashtags()" class="btn btn-sm btn-primary">
          Add All to Caption
        </button>
      </div>
      <p style="color: #6b7280; font-size: 13px; margin: 0;">
        Platform limit: ${data.maxHashtags} hashtags
      </p>
    </div>
  `;

  // High volume hashtags
  if (data.hashtags.high && data.hashtags.high.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h5 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">
          📊 HIGH VOLUME (100k+ posts)
        </h5>
        <div class="hashtag-chips">
          ${data.hashtags.high.map(tag => `
            <span class="hashtag-chip" onclick="addHashtagToCaption('${tag}')">
              ${tag}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Medium volume hashtags
  if (data.hashtags.medium && data.hashtags.medium.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h5 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">
          📈 MEDIUM VOLUME (10k-100k posts)
        </h5>
        <div class="hashtag-chips">
          ${data.hashtags.medium.map(tag => `
            <span class="hashtag-chip" onclick="addHashtagToCaption('${tag}')">
              ${tag}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Niche hashtags
  if (data.hashtags.niche && data.hashtags.niche.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h5 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">
          🎯 NICHE (<10k posts)
        </h5>
        <div class="hashtag-chips">
          ${data.hashtags.niche.map(tag => `
            <span class="hashtag-chip" onclick="addHashtagToCaption('${tag}')">
              ${tag}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function addHashtagToCaption(hashtag) {
  const captionTextarea = document.getElementById('caption');
  const currentCaption = captionTextarea.value;

  // Check if hashtag already exists
  if (currentCaption.includes(hashtag)) {
    showNotification('Hashtag already in caption', 'info');
    return;
  }

  // Add hashtag with a space if needed
  const separator = currentCaption && !currentCaption.endsWith(' ') && !currentCaption.endsWith('\n') ? ' ' : '';
  captionTextarea.value = currentCaption + separator + hashtag;

  // Visual feedback
  showNotification(`Added ${hashtag}`, 'success');

  // Highlight the chip temporarily
  event.target.style.background = '#10b981';
  event.target.style.color = 'white';
  setTimeout(() => {
    event.target.style.background = '';
    event.target.style.color = '';
  }, 500);
}

function addAllHashtags() {
  const hashtagContainer = document.getElementById('hashtagSuggestions');
  const chips = hashtagContainer.querySelectorAll('.hashtag-chip');

  let added = 0;
  chips.forEach(chip => {
    const hashtag = chip.textContent.trim();
    const captionTextarea = document.getElementById('caption');
    const currentCaption = captionTextarea.value;

    // Only add if not already in caption
    if (!currentCaption.includes(hashtag)) {
      const separator = currentCaption && !currentCaption.endsWith(' ') && !currentCaption.endsWith('\n') ? ' ' : '';
      captionTextarea.value = currentCaption + separator + hashtag;
      added++;
    }
  });

  showNotification(`Added ${added} hashtags to caption`, 'success');
}

// Export functions for global access
window.getHashtagSuggestions = getHashtagSuggestions;
window.addHashtagToCaption = addHashtagToCaption;
window.addAllHashtags = addAllHashtags;
