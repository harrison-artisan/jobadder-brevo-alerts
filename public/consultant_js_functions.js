
// Consolidated Consultant Newsletter Functions
// Handles toggles, rich text editing, image previews, and saving for consultant newsletters

function showConsultantEditPanel() {
    const panel = document.getElementById('consultantEditSectionsPanel');
    if (panel) panel.style.display = 'block';
}

function hideConsultantEditPanel() {
    const panel = document.getElementById('consultantEditSectionsPanel');
    if (panel) panel.style.display = 'none';
}

function populateConsultantEditor(data) {
    if (!data) return;
    
    // 1. Industry Insight
    if (data.industryInsight) {
        const heading = document.getElementById('editIndustryInsightHeading');
        const body = document.getElementById('editIndustryInsightBody');
        if (heading) heading.value = data.industryInsight.heading || '';
        if (body) body.value = data.industryInsight.body || '';
    }
    
    // 2. Personal Update
    if (data.lifeUpdate) {
        const heading = document.getElementById('editLifeUpdateHeading');
        const body = document.getElementById('editLifeUpdateBody');
        if (heading) heading.value = data.lifeUpdate.heading || '';
        if (body) body.value = data.lifeUpdate.body || '';
    }
    
    // 3. Instagram
    if (data.instagram) {
        const caption = document.getElementById('igCaption');
        if (caption) caption.value = data.instagram.caption || '';
    }
    
    // 4. Events
    populateEventsEditor(data.events || []);
    
    // 5. Media (Worth Reading)
    populateMediaEditor(data.media || []);
    
    // 6. Toggles
    if (data.sections) {
        const mapping = {
            industryInsight: 'toggleIndustryInsight',
            lifeUpdate: 'toggleLifeUpdate',
            instagram: 'toggleInstagram',
            events: 'toggleEvents',
            media: 'toggleMedia'
        };
        Object.keys(mapping).forEach(key => {
            const toggle = document.getElementById(mapping[key]);
            if (toggle) toggle.checked = !!data.sections[key];
        });
    }
}

function addEventBox(event = { title: '', url: '', date: '' }) {
    const container = document.getElementById('eventsEditContainer');
    if (!container) return;
    
    if (container.innerHTML.includes('No events')) container.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'event-edit-row';
    row.style.cssText = 'padding:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:10px; position:relative;';
    row.innerHTML = `
        <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:8px; background:none; border:none; color:rgba(231,76,60,0.6); cursor:pointer; font-size:16px;">&times;</button>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
            <div style="flex:1;">
                <label style="display:block; color:rgba(255,255,255,0.4); font-size:10px; text-transform:uppercase; margin-bottom:4px;">Event Title</label>
                <input type="text" placeholder="Event Title" class="event-title" value="${event.title || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
            </div>
            <div style="flex:1;">
                <label style="display:block; color:rgba(255,255,255,0.4); font-size:10px; text-transform:uppercase; margin-bottom:4px;">Date</label>
                <input type="text" placeholder="e.g. 15th May" class="event-date" value="${event.date || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
            </div>
        </div>
        <div>
            <label style="display:block; color:rgba(255,255,255,0.4); font-size:10px; text-transform:uppercase; margin-bottom:4px;">Booking URL</label>
            <input type="url" placeholder="https://..." class="event-url" value="${event.url || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
        </div>
    `;
    container.appendChild(row);
}

function populateEventsEditor(events) {
    const container = document.getElementById('eventsEditContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (events && events.length > 0) {
        events.forEach(event => addEventBox(event));
    } else {
        // Show 3 empty slots by default
        for(let i=0; i<3; i++) addEventBox();
    }

    let addBtn = document.getElementById('btnAddEvent');
    if (!addBtn) {
        addBtn = document.createElement('button');
        addBtn.id = 'btnAddEvent';
        addBtn.textContent = '+ Add Event';
        addBtn.style.cssText = 'width:100%; padding:10px; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.2); border-radius:8px; color:rgba(255,255,255,0.6); font-size:12px; cursor:pointer; margin-top:5px;';
        addBtn.onclick = () => addEventBox();
        container.insertAdjacentElement('afterend', addBtn);
    }
}

function addMediaBox(item = { title: '', url: '', type: 'link' }) {
    const container = document.getElementById('mediaEditContainer');
    if (!container) return;
    
    if (container.innerHTML.includes('No media')) container.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'media-edit-row';
    row.style.cssText = 'padding:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:10px; position:relative;';
    row.innerHTML = `
        <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:8px; background:none; border:none; color:rgba(231,76,60,0.6); cursor:pointer; font-size:16px;">&times;</button>
        <div style="margin-bottom:8px;">
            <label style="display:block; color:rgba(255,255,255,0.4); font-size:10px; text-transform:uppercase; margin-bottom:4px;">Media Type</label>
            <select class="media-type" style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
                <option value="link" ${item.type === 'link' ? 'selected' : ''}>Worth Reading (Link Card)</option>
                <option value="youtube" ${item.type === 'youtube' ? 'selected' : ''}>YouTube Video</option>
                <option value="podcast" ${item.type === 'podcast' ? 'selected' : ''}>Podcast URL</option>
            </select>
        </div>
        <div style="margin-bottom:8px;">
            <label style="display:block; color:rgba(255,255,255,0.4); font-size:10px; text-transform:uppercase; margin-bottom:4px;">Title / Caption</label>
            <input type="text" placeholder="e.g. Why AI is changing Design" class="media-title" value="${item.title || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
        </div>
        <div>
            <label style="display:block; color:rgba(255,255,255,0.4); font-size:10px; text-transform:uppercase; margin-bottom:4px;">URL</label>
            <input type="url" placeholder="https://..." class="media-url" value="${item.url || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
        </div>
    `;
    container.appendChild(row);
}

function populateMediaEditor(mediaItems) {
    const container = document.getElementById('mediaEditContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (mediaItems && mediaItems.length > 0) {
        mediaItems.forEach(item => addMediaBox(item));
    } else {
        // Show 1 empty box by default if none in CSV
        addMediaBox();
    }

    // Ensure button is always there and correctly placed
    let addBtn = document.getElementById('btnAddMedia');
    if (!addBtn) {
        addBtn = document.createElement('button');
        addBtn.id = 'btnAddMedia';
        addBtn.textContent = '+ Add Worth Reading / Media Item';
        addBtn.style.cssText = 'width:100%; padding:10px; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.2); border-radius:8px; color:rgba(255,255,255,0.6); font-size:12px; cursor:pointer; margin-top:5px;';
        addBtn.onclick = () => addMediaBox();
        container.insertAdjacentElement('afterend', addBtn);
    }
}

async function updateConsultantSectionVisibility() {
    const btn = document.querySelector('#consultantEditSectionsPanel .btn-success');
    if (!btn) return;
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const sections = {
        industryInsight: document.getElementById('toggleIndustryInsight')?.checked || false,
        lifeUpdate: document.getElementById('toggleLifeUpdate')?.checked || false,
        instagram: document.getElementById('toggleInstagram')?.checked || false,
        events: document.getElementById('toggleEvents')?.checked || false,
        media: document.getElementById('toggleMedia')?.checked || false,
        articles: true
    };

    const industryInsight = {
        heading: document.getElementById('editIndustryInsightHeading')?.value || '',
        body: document.getElementById('editIndustryInsightBody')?.value || ''
    };

    const lifeUpdate = {
        heading: document.getElementById('editLifeUpdateHeading')?.value || '',
        body: document.getElementById('editLifeUpdateBody')?.value || ''
    };

    const instagram = {
        caption: document.getElementById('igCaption')?.value || ''
    };

    const events = Array.from(document.querySelectorAll('.event-edit-row')).map(row => ({
        title: row.querySelector('.event-title').value,
        date: row.querySelector('.event-date').value,
        url: row.querySelector('.event-url').value
    })).filter(e => e.title || e.url);

    const media = Array.from(document.querySelectorAll('.media-edit-row')).map(row => ({
        type: row.querySelector('.media-type').value,
        title: row.querySelector('.media-title').value,
        url: row.querySelector('.media-url').value
    })).filter(m => m.title || m.url);

    const payload = {
        sections,
        industryInsight,
        lifeUpdate,
        instagram,
        events,
        media
    };

    try {
        const response = await fetch('/api/consultant/update-sections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (response.ok) {
            if (typeof showToast === 'function') {
                showToast('✅ Newsletter edits saved successfully!', 'success');
            } else {
                alert('Newsletter edits saved successfully!');
            }
            if (typeof refreshConsultantPreview === 'function') {
                refreshConsultantPreview();
            }
        } else {
            const errorMsg = result.message || 'Failed to save edits';
            if (typeof showToast === 'function') {
                showToast('❌ Error: ' + errorMsg, 'error');
            } else {
                alert('Error: ' + errorMsg);
            }
        }
    } catch (error) {
        if (typeof showToast === 'function') {
            showToast('❌ Error: ' + error.message, 'error');
        } else {
            alert('Error: ' + error.message);
        }
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
