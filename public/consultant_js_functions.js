// Consultant Newsletter Editing Functions

function showConsultantEditPanel() {
    const panel = document.getElementById('consultantEditSectionsPanel');
    if (panel) panel.style.display = 'block';
}

function addEventField(data = { title: '', date: '', url: '', description: '' }) {
    const container = document.getElementById('eventsEditContainer');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'event-edit-item';
    div.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:8px; align-items:start; margin-bottom:12px; padding:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:6px;';
    
    div.innerHTML = `
        <div style="grid-column: span 3; display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
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
            <div style="grid-column: span 3; margin-top:8px;">
                <label style="display:block; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">Description (Max 250 chars)</label>
                <textarea class="event-description" maxlength="250" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px; height:40px; resize:none;">${data.description || ''}</textarea>
            </div>
        </div>
        <button onclick="this.parentElement.remove()" style="padding:6px; background:#e74c3c; border:none; border-radius:4px; color:white; cursor:pointer; margin-top:18px;">&times;</button>
    `;
    container.appendChild(div);
}

function populateEventsEditor(events = []) {
    const container = document.getElementById('eventsEditContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (events.length === 0) {
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

    const btn = document.getElementById('btnSaveConsultantChanges');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 0.8s linear infinite;" style="animation: spin 0.8s linear infinite;"></span> Saving...';

    const sections = {
        industry_insight: document.getElementById('toggleIndustryInsight').checked,
        life_update: document.getElementById('toggleLifeUpdate').checked,
        media: document.getElementById('toggleMedia').checked,
        events: document.getElementById('toggleEvents').checked,
        instagram_grid: document.getElementById('toggleInstagram').checked
    };

    const content = {
        industry_insight: {
            title: document.getElementById('editIndustryInsightHeading').value,
            body: document.getElementById('editIndustryInsightBody').value
        },
        personal_update: {
            title: document.getElementById('editLifeUpdateHeading').value,
            body: document.getElementById('editLifeUpdateBody').value
        },
        instagram: {
            caption: document.getElementById('igCaption').value
        }
    };

    const eventItems = document.querySelectorAll('.event-edit-item');
    const events = Array.from(eventItems).map(item => ({
        title: item.querySelector('.event-title').value,
        date: item.querySelector('.event-date').value,
        url: item.querySelector('.event-url').value,
        description: item.querySelector('.event-description') ? item.querySelector('.event-description').value : ''
    })).filter(e => e.title || e.url);

    const mediaItems = document.querySelectorAll('.media-edit-item');
    const media = Array.from(mediaItems).map(item => ({
        title: item.querySelector('.media-title').value,
        url: item.querySelector('.media-url').value,
        type: item.querySelector('.media-type').value,
        caption: item.querySelector('.media-title').value
    })).filter(m => m.title || m.url);

    const instagram_grid = [];
    for (let i = 1; i <= 4; i++) {
        const preview = document.getElementById('igPreview' + i);
        if (preview && preview.style.backgroundImage && preview.style.backgroundImage !== 'none') {
            try {
                const bgImage = preview.style.backgroundImage;
                const url = bgImage.slice(5, -2);
                if (url && url.startsWith('data:')) {
                    instagram_grid.push(url);
                }
            } catch (e) {
                console.warn('Error extracting Instagram image ' + i, e);
            }
        }
    }

    const life_update_images = [];
    for (let i = 1; i <= 3; i++) {
        const preview = document.getElementById('lifeUpdatePreview' + i);
        if (preview && preview.style.backgroundImage && preview.style.backgroundImage !== 'none') {
            try {
                const bgImage = preview.style.backgroundImage;
                const url = bgImage.slice(5, -2);
                if (url && url.startsWith('data:')) {
                    life_update_images.push(url);
                }
            } catch (e) {
                console.warn('Error extracting Life Update image ' + i, e);
            }
        }
    }

    console.log('Saving:', { sections, content, events, media, instagram_grid, life_update_images });

    try {
        const response = await fetch('/api/consultant/update-sections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sections, content, events, media, instagram_grid, life_update_images })
        });

        const data = await response.json();
        if (response.ok) {
            showToast('✅ Edits saved successfully!', 'success');
            btn.innerHTML = 'Save All Changes';
            btn.disabled = false;
            if (typeof previewConsultantNewsletter === 'function') {
                previewConsultantNewsletter();
            }
        } else {
            showToast('❌ Error saving edits: ' + (data.error || 'Unknown error'), 'error');
            btn.innerHTML = 'Save All Changes';
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Save error:', err);
        showToast('❌ Connection error while saving.', 'error');
        btn.innerHTML = 'Save All Changes';
        btn.disabled = false;
    }
}
