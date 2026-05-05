
// Consultant Newsletter Editing Functions

function showConsultantEditPanel() {
    const panel = document.getElementById('consultantEditSectionsPanel');
    if (panel) panel.style.display = 'block';
}

function addEventField(data = { title: '', date: '', url: '' }) {
    const container = document.getElementById('eventsEditContainer');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'event-edit-item';
    div.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:8px; align-items:end; margin-bottom:8px; padding:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px;';
    
    div.innerHTML = `
        <div>
            <label style="display:block; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">Title</label>
            <input type="text" class="event-title" value="${data.title || ''}" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px;">
        </div>
        <div>
            <label style="display:block; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">Date (e.g. 15 May)</label>
            <input type="text" class="event-date" value="${data.date || ''}" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px;">
        </div>
        <div>
            <label style="display:block; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">URL</label>
            <input type="text" class="event-url" value="${data.url || ''}" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px;">
        </div>
        <button onclick="this.parentElement.remove()" style="padding:6px; background:#e74c3c; border:none; border-radius:4px; color:white; cursor:pointer;">&times;</button>
    `;
    container.appendChild(div);
}

function populateEventsEditor(events = []) {
    const container = document.getElementById('eventsEditContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (events.length === 0) {
        // Add 3 empty slots if none in CSV
        for (let i = 0; i < 3; i++) addEventField();
    } else {
        events.forEach(ev => addEventField(ev));
    }
}

function addMediaField(data = { title: '', url: '', type: 'link' }) {
    const container = document.getElementById('mediaEditContainer');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'media-edit-item';
    div.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:8px; align-items:end; margin-bottom:8px; padding:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px;';
    
    div.innerHTML = `
        <div>
            <label style="display:block; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">Title / Caption</label>
            <input type="text" class="media-title" value="${data.title || ''}" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px;">
        </div>
        <div>
            <label style="display:block; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">URL</label>
            <input type="text" class="media-url" value="${data.url || ''}" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px;">
        </div>
        <div>
            <label style="display:block; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">Type</label>
            <select class="media-type" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px;">
                <option value="link" ${data.type === 'link' ? 'selected' : ''}>Worth Reading</option>
                <option value="youtube" ${data.type === 'youtube' ? 'selected' : ''}>YouTube</option>
                <option value="podcast" ${data.type === 'podcast' ? 'selected' : ''}>Podcast</option>
                <option value="instagram" ${data.type === 'instagram' ? 'selected' : ''}>Instagram</option>
            </select>
        </div>
        <button onclick="this.parentElement.remove()" style="padding:6px; background:#e74c3c; border:none; border-radius:4px; color:white; cursor:pointer;">&times;</button>
    `;
    container.appendChild(div);
}

function populateMediaEditor(media = []) {
    const container = document.getElementById('mediaEditContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (media.length === 0) {
        // Add 3 empty slots if none in CSV
        for (let i = 0; i < 3; i++) addMediaField();
    } else {
        media.forEach(m => addMediaField(m));
    }
}

async function updateConsultantSectionVisibility() {
    if (!consultantParsed) {
        showToast('❌ No newsletter built yet. Upload CSV first.', 'error');
        return;
    }

    const btn = document.querySelector('button[onclick="updateConsultantSectionVisibility()"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving Changes...';

    // Collect sections
    const sections = {
        industry_insight: document.getElementById('toggleIndustryInsight').checked,
        life_update: document.getElementById('toggleLifeUpdate').checked,
        instagram_grid: document.getElementById('toggleInstagram').checked,
        events: document.getElementById('toggleEvents').checked,
        media: document.getElementById('toggleMedia').checked
    };

    // Collect text content
    const content = {
        industry_insight: {
            heading: document.getElementById('editIndustryInsightHeading').value,
            body: document.getElementById('editIndustryInsightBody').value
        },
        life_update: {
            heading: document.getElementById('editLifeUpdateHeading').value,
            body: document.getElementById('editLifeUpdateBody').value
        },
        instagram_grid: {
            caption: document.getElementById('igCaption').value
        }
    };

    // Collect Events
    const eventItems = document.querySelectorAll('.event-edit-item');
    const events = Array.from(eventItems).map(item => ({
        title: item.querySelector('.event-title').value,
        date: item.querySelector('.event-date').value,
        url: item.querySelector('.event-url').value
    })).filter(e => e.title || e.url);

    // Collect Media
    const mediaItems = document.querySelectorAll('.media-edit-item');
    const media = Array.from(mediaItems).map(item => ({
        title: item.querySelector('.media-title').value,
        url: item.querySelector('.media-url').value,
        type: item.querySelector('.media-type').value
    })).filter(m => m.title || m.url);

    try {
        const response = await fetch('/api/consultant/update-sections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sections, content, events, media })
        });

        const data = await response.json();
        if (response.ok) {
            showToast('✅ Edits saved successfully!', 'success');
            // Refresh preview
            if (typeof loadPreview === 'function') loadPreview('/api/preview/consultant');
        } else {
            showToast('❌ Save failed: ' + (data.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showToast('❌ Network error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function previewLifeUpdateImage(index) {
    const input = document.getElementById('lifeUpdateImage' + index);
    const preview = document.getElementById('lifeUpdatePreview' + index);
    if (input && preview && input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.style.borderStyle = 'solid';
            preview.textContent = '';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function previewInstagramImage(index) {
    const input = document.getElementById('igImage' + index);
    const preview = document.getElementById('igPreview' + index);
    if (input && preview && input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.style.borderStyle = 'solid';
            preview.textContent = '';
        };
        reader.readAsDataURL(input.files[0]);
    }
}
