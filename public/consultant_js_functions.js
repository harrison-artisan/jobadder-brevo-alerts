
        // Show/hide the edit sections panel
        function showConsultantEditPanel() {
            let panel = document.getElementById('consultantEditSectionsPanel');
            if (!panel) {
                const step1 = document.querySelector('.actions-card'); // First card is Step 1
                if (step1) {
                    const panelHtml = `
<div id="consultantEditSectionsPanel" style="display:none; margin-top:20px; padding:20px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:10px;">
    <h3 style="margin:0 0 20px 0; color:white; font-size:16px; font-weight:700;">Edit & Customize Newsletter</h3>
    
    <!-- INDUSTRY INSIGHT SECTION -->
    <div style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:rgba(255,255,255,0.9); font-size:13px; font-weight:600; margin-bottom:12px;">
            <input type="checkbox" id="toggleIndustryInsight" checked style="cursor:pointer; width:18px; height:18px;" onchange="updateConsultantSectionVisibility()">
            <span>Industry Insight</span>
        </label>
        <div style="margin-bottom:10px;">
            <label style="display:block; color:rgba(255,255,255,0.5); font-size:11px; margin-bottom:4px; text-transform:uppercase;">Heading</label>
            <input type="text" id="editIndustryInsightHeading" style="width:100%; padding:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:white; font-size:13px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
        </div>
        <div>
            <label style="display:block; color:rgba(255,255,255,0.5); font-size:11px; margin-bottom:4px; text-transform:uppercase;">Content</label>
            <textarea id="editIndustryInsightBody" rows="3" style="width:100%; padding:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:white; font-size:13px; box-sizing:border-box; resize:vertical;" onchange="updateConsultantSectionVisibility()"></textarea>
        </div>
    </div>

    <!-- PERSONAL UPDATE SECTION -->
    <div style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:rgba(255,255,255,0.9); font-size:13px; font-weight:600; margin-bottom:12px;">
            <input type="checkbox" id="toggleLifeUpdate" checked style="cursor:pointer; width:18px; height:18px;" onchange="updateConsultantSectionVisibility()">
            <span>Personal Update</span>
        </label>
        <div style="margin-bottom:10px;">
            <label style="display:block; color:rgba(255,255,255,0.5); font-size:11px; margin-bottom:4px; text-transform:uppercase;">Heading</label>
            <input type="text" id="editLifeUpdateHeading" style="width:100%; padding:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:white; font-size:13px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
        </div>
        <div style="margin-bottom:10px;">
            <label style="display:block; color:rgba(255,255,255,0.5); font-size:11px; margin-bottom:4px; text-transform:uppercase;">Content</label>
            <textarea id="editLifeUpdateBody" rows="3" style="width:100%; padding:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:white; font-size:13px; box-sizing:border-box; resize:vertical;" onchange="updateConsultantSectionVisibility()"></textarea>
        </div>
        <div>
            <label style="display:block; color:rgba(255,255,255,0.5); font-size:11px; margin-bottom:8px; text-transform:uppercase;">Add Photos (Optional)</label>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
                <div style="text-align:center;">
                    <input type="file" id="lifeUpdateImage1" accept="image/*" style="display:none;" onchange="previewLifeUpdateImage(1)">
                    <div id="lifeUpdatePreview1" onclick="document.getElementById('lifeUpdateImage1').click();" style="width:100%; aspect-ratio:1; max-width:80px; margin:0 auto; background:rgba(255,255,255,0.08); border:2px dashed rgba(255,255,255,0.2); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:20px; color:rgba(255,255,255,0.3);">+</div>
                </div>
                <div style="text-align:center;">
                    <input type="file" id="lifeUpdateImage2" accept="image/*" style="display:none;" onchange="previewLifeUpdateImage(2)">
                    <div id="lifeUpdatePreview2" onclick="document.getElementById('lifeUpdateImage2').click();" style="width:100%; aspect-ratio:1; max-width:80px; margin:0 auto; background:rgba(255,255,255,0.08); border:2px dashed rgba(255,255,255,0.2); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:20px; color:rgba(255,255,255,0.3);">+</div>
                </div>
                <div style="text-align:center;">
                    <input type="file" id="lifeUpdateImage3" accept="image/*" style="display:none;" onchange="previewLifeUpdateImage(3)">
                    <div id="lifeUpdatePreview3" onclick="document.getElementById('lifeUpdateImage3').click();" style="width:100%; aspect-ratio:1; max-width:80px; margin:0 auto; background:rgba(255,255,255,0.08); border:2px dashed rgba(255,255,255,0.2); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:20px; color:rgba(255,255,255,0.3);">+</div>
                </div>
            </div>
        </div>
    </div>

    <!-- INSTAGRAM SECTION -->
    <div style="margin-bottom:24px; padding:16px; background:rgba(189,32,61,0.1); border:1px solid rgba(189,32,61,0.3); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:rgba(255,255,255,0.9); font-size:13px; font-weight:600; margin-bottom:12px;">
            <input type="checkbox" id="toggleInstagram" style="cursor:pointer; width:18px; height:18px;" onchange="updateConsultantSectionVisibility()">
            <span>Instagram Grid</span>
        </label>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:12px;">
            <div style="text-align:center;">
                <input type="file" id="igImage1" accept="image/*" style="display:none;" onchange="previewInstagramImage(1)">
                <div id="igPreview1" onclick="document.getElementById('igImage1').click();" style="width:100%; aspect-ratio:1; max-width:60px; margin:0 auto; background:rgba(255,255,255,0.08); border:2px dashed rgba(255,255,255,0.2); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; color:rgba(255,255,255,0.3);">+</div>
            </div>
            <div style="text-align:center;">
                <input type="file" id="igImage2" accept="image/*" style="display:none;" onchange="previewInstagramImage(2)">
                <div id="igPreview2" onclick="document.getElementById('igImage2').click();" style="width:100%; aspect-ratio:1; max-width:60px; margin:0 auto; background:rgba(255,255,255,0.08); border:2px dashed rgba(255,255,255,0.2); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; color:rgba(255,255,255,0.3);">+</div>
            </div>
            <div style="text-align:center;">
                <input type="file" id="igImage3" accept="image/*" style="display:none;" onchange="previewInstagramImage(3)">
                <div id="igPreview3" onclick="document.getElementById('igImage3').click();" style="width:100%; aspect-ratio:1; max-width:60px; margin:0 auto; background:rgba(255,255,255,0.08); border:2px dashed rgba(255,255,255,0.2); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; color:rgba(255,255,255,0.3);">+</div>
            </div>
            <div style="text-align:center;">
                <input type="file" id="igImage4" accept="image/*" style="display:none;" onchange="previewInstagramImage(4)">
                <div id="igPreview4" onclick="document.getElementById('igImage4').click();" style="width:100%; aspect-ratio:1; max-width:60px; margin:0 auto; background:rgba(255,255,255,0.08); border:2px dashed rgba(255,255,255,0.2); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; color:rgba(255,255,255,0.3);">+</div>
            </div>
        </div>
        <div>
            <label style="display:block; color:rgba(255,255,255,0.5); font-size:11px; margin-bottom:4px; text-transform:uppercase;">Caption (All 4 Images)</label>
            <input type="text" id="igCaption" placeholder="Add a caption for the Instagram grid" style="width:100%; padding:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:white; font-size:13px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
        </div>
    </div>

    <!-- ARTICLES SECTION (Non-editable) -->
    <div style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:rgba(255,255,255,0.9); font-size:13px; font-weight:600; margin-bottom:12px;">
            <input type="checkbox" id="toggleArticles" checked style="cursor:pointer; width:18px; height:18px;" onchange="updateConsultantSectionVisibility()">
            <span>Articles</span>
        </label>
        <div id="articlesEditContainer" style="color:rgba(255,255,255,0.6); font-size:12px;">Articles will be auto-populated from WordPress</div>
    </div>

    <!-- EVENTS SECTION -->
    <div style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:rgba(255,255,255,0.9); font-size:13px; font-weight:600; margin-bottom:12px;">
            <input type="checkbox" id="toggleEvents" checked style="cursor:pointer; width:18px; height:18px;" onchange="updateConsultantSectionVisibility()">
            <span>Events</span>
        </label>
        <div id="eventsEditContainer" style="display:grid; gap:10px;"></div>
    </div>

    <!-- WORTH READING / MEDIA SECTION -->
    <div style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:rgba(255,255,255,0.9); font-size:13px; font-weight:600; margin-bottom:12px;">
            <input type="checkbox" id="toggleMedia" style="cursor:pointer; width:18px; height:18px;" onchange="updateConsultantSectionVisibility()">
            <span>Worth Reading / Media</span>
        </label>
        <div id="mediaEditContainer" style="color:rgba(255,255,255,0.6); font-size:12px;">Media will be auto-populated from CSV</div>
    </div>
</div>
`;
                    step1.insertAdjacentHTML('afterend', panelHtml);
                    panel = document.getElementById('consultantEditSectionsPanel');
                }
            }
            if (panel) panel.style.display = 'block';
        }

        function hideConsultantEditPanel() {
            const panel = document.getElementById('consultantEditSectionsPanel');
            if (panel) panel.style.display = 'none';
        }

        // Preview Instagram image in the grid
        function previewInstagramImage(index) {
            const input = document.getElementById(`igImage${index}`);
            const preview = document.getElementById(`igPreview${index}`);
            
            if (input && preview && input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.style.backgroundImage = `url('${e.target.result}')`;
                    preview.style.backgroundSize = 'cover';
                    preview.style.backgroundPosition = 'center';
                    preview.textContent = '';
                };
                reader.readAsDataURL(input.files[0]);
            }
        }

        // Preview Personal Update Image
        function previewLifeUpdateImage(index) {
            const input = document.getElementById(`lifeUpdateImage${index}`);
            const preview = document.getElementById(`lifeUpdatePreview${index}`);
            
            if (input && preview && input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.style.backgroundImage = `url('${e.target.result}')`;
                    preview.style.backgroundSize = 'cover';
                    preview.style.backgroundPosition = 'center';
                    preview.textContent = '';
                };
                reader.readAsDataURL(input.files[0]);
            }
        }

        // Populate Events Container with editable fields
        function populateEventsEditor(events) {
            const container = document.getElementById('eventsEditContainer');
            if (!container) return;
            container.innerHTML = '';
            
            if (!events || events.length === 0) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.5); font-size:12px;">No events in CSV</div>';
                return;
            }

            events.forEach((event, idx) => {
                const eventBox = document.createElement('div');
                eventBox.style.cssText = 'padding:12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; margin-bottom:10px;';
                eventBox.innerHTML = `
                    <div style="margin-bottom:8px;">
                        <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Event Title</label>
                        <input type="text" class="eventTitle" value="${event.title || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
                    </div>
                    <div style="margin-bottom:8px;">
                        <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Date</label>
                        <input type="text" class="eventDate" value="${event.date || ''}" placeholder="e.g. 15 May 2026" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
                    </div>
                    <div>
                        <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">URL (Optional)</label>
                        <input type="text" class="eventUrl" value="${event.url || ''}" placeholder="https://..." style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
                    </div>
                `;
                container.appendChild(eventBox);
            });
        }

        // Populate Media Container with editable fields
        function populateMediaEditor(media) {
            const container = document.getElementById('mediaEditContainer');
            if (!container) return;
            container.innerHTML = '';
            
            if (!media || media.length === 0) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.5); font-size:12px;">No media in CSV</div>';
                return;
            }

            media.forEach((item, idx) => {
                const mediaBox = document.createElement('div');
                mediaBox.style.cssText = 'padding:12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; margin-bottom:10px;';
                
                let typeLabel = 'Worth Reading';
                if (item.type === 'youtube') typeLabel = 'YouTube Video';
                else if (item.type === 'instagram') typeLabel = 'Instagram Post';
                
                mediaBox.innerHTML = `
                    <div style="margin-bottom:8px;">
                        <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Type: ${typeLabel}</label>
                    </div>
                    <div style="margin-bottom:8px;">
                        <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Title</label>
                        <input type="text" class="mediaTitle" value="${item.title || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
                    </div>
                    <div>
                        <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">URL</label>
                        <input type="text" class="mediaUrl" value="${item.url || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;" onchange="updateConsultantSectionVisibility()">
                    </div>
                `;
                container.appendChild(mediaBox);
            });
        }

        // Update section visibility and content, then send to backend
        async function updateConsultantSectionVisibility() {
            try {
                // 1. Basic toggles
                const sections = {
                    industry_insight: document.getElementById('toggleIndustryInsight')?.checked || false,
                    life_update: document.getElementById('toggleLifeUpdate')?.checked || false,
                    instagram: document.getElementById('toggleInstagram')?.checked || false,
                    events: document.getElementById('toggleEvents')?.checked || false,
                    media: document.getElementById('toggleMedia')?.checked || false
                };

                // 2. Industry Insight Content
                const industry_insight_content = {
                    heading: document.getElementById('editIndustryInsightHeading')?.value || '',
                    body: document.getElementById('editIndustryInsightBody')?.value || ''
                };

                // 3. Life Update Content
                const life_update_content = {
                    heading: document.getElementById('editLifeUpdateHeading')?.value || '',
                    body: document.getElementById('editLifeUpdateBody')?.value || '',
                    images: []
                };
                
                // Collect Life Update images (base64)
                for (let i = 1; i <= 3; i++) {
                    const input = document.getElementById(`lifeUpdateImage${i}`);
                    if (input && input.files && input.files[0]) {
                        const dataUrl = await new Promise(resolve => {
                            const reader = new FileReader();
                            reader.onload = e => resolve(e.target.result);
                            reader.readAsDataURL(input.files[0]);
                        });
                        life_update_content.images.push(dataUrl);
                    }
                }

                // 4. Instagram Grid
                const instagram_grid = {
                    has_grid: sections.instagram,
                    images: []
                };
                
                for (let i = 1; i <= 4; i++) {
                    const input = document.getElementById(`igImage${i}`);
                    const captionInput = document.getElementById(`igCaption${i}`) || document.getElementById('igCaption');
                    const caption = captionInput ? captionInput.value : '';
                    
                    if (input && input.files && input.files[0]) {
                        const dataUrl = await new Promise(resolve => {
                            const reader = new FileReader();
                            reader.onload = e => resolve(e.target.result);
                            reader.readAsDataURL(input.files[0]);
                        });
                        instagram_grid.images.push({
                            url: dataUrl,
                            caption: caption
                        });
                    }
                }

                // 5. Events
                const events = [];
                const eventBoxes = document.querySelectorAll('#eventsEditContainer > div');
                eventBoxes.forEach(box => {
                    events.push({
                        title: box.querySelector('.eventTitle')?.value || '',
                        date: box.querySelector('.eventDate')?.value || '',
                        url: box.querySelector('.eventUrl')?.value || ''
                    });
                });

                // 6. Media
                const media = [];
                const mediaBoxes = document.querySelectorAll('#mediaEditContainer > div');
                mediaBoxes.forEach(box => {
                    media.push({
                        title: box.querySelector('.mediaTitle')?.value || '',
                        url: box.querySelector('.mediaUrl')?.value || ''
                    });
                });

                // Send update to backend
                const payload = { 
                    sections, 
                    industry_insight_content,
                    life_update_content,
                    instagram_grid,
                    events,
                    media
                };

                const response = await fetch('/api/consultant/update-sections', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (data.success) {
                    console.log('✅ Dashboard state updated');
                    if (typeof loadPreview === 'function') {
                        loadPreview('/api/preview/consultant');
                    }
                } else {
                    if (typeof showToast === 'function') showToast('Failed to update: ' + data.message, 'error');
                }
            } catch (error) {
                console.error('Error updating sections:', error);
                if (typeof showToast === 'function') showToast('Error updating sections: ' + error.message, 'error');
            }
        }
