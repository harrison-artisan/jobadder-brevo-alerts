
        // Show/hide the edit sections panel
        function showConsultantEditPanel() {
            const panel = document.getElementById('consultantEditSectionsPanel');
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

        // Helper to add an event box
        function addEventBox(event = {}) {
            const container = document.getElementById('eventsEditContainer');
            if (!container) return;
            
            // Remove "No events" placeholder if it exists
            if (container.innerHTML.includes('No events')) container.innerHTML = '';

            const eventBox = document.createElement('div');
            eventBox.className = 'event-edit-box';
            eventBox.style.cssText = 'padding:12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; margin-bottom:10px; position:relative;';
            eventBox.innerHTML = `
                <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:8px; background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px;">&times;</button>
                <div style="margin-bottom:8px;">
                    <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Event Title</label>
                    <input type="text" class="eventTitle" value="${event.title || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:8px;">
                    <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Date</label>
                    <input type="text" class="eventDate" value="${event.date || ''}" placeholder="e.g. 15 May 2026" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
                </div>
                <div>
                    <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">URL (Optional)</label>
                    <input type="text" class="eventUrl" value="${event.url || ''}" placeholder="https://..." style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
                </div>
            `;
            container.appendChild(eventBox);
        }

        // Populate Events Container with editable fields
        function populateEventsEditor(events) {
            const container = document.getElementById('eventsEditContainer');
            if (!container) return;
            container.innerHTML = '';
            
            if (!events || events.length === 0) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.5); font-size:12px; margin-bottom:10px;">No events in CSV</div>';
            } else {
                events.forEach(event => addEventBox(event));
            }

            // Add button if not already present
            if (!document.getElementById('btnAddEvent')) {
                const addBtn = document.createElement('button');
                addBtn.id = 'btnAddEvent';
                addBtn.className = 'btn';
                addBtn.style.cssText = 'width:100%; padding:8px; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.2); color:rgba(255,255,255,0.7); font-size:12px; margin-top:5px;';
                addBtn.textContent = '+ Add Event';
                addBtn.onclick = () => addEventBox();
                container.parentElement.appendChild(addBtn);
            }
        }

        // Helper to add a media box
        function addMediaBox(item = {}) {
            const container = document.getElementById('mediaEditContainer');
            if (!container) return;
            
            if (container.innerHTML.includes('No media')) container.innerHTML = '';

            const mediaBox = document.createElement('div');
            mediaBox.className = 'media-edit-box';
            mediaBox.style.cssText = 'padding:12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; margin-bottom:10px; position:relative;';
            
            const type = item.type || 'link';
            
            mediaBox.innerHTML = `
                <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:8px; background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px;">&times;</button>
                <div style="margin-bottom:8px;">
                    <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Media Type</label>
                    <select class="mediaType" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
                        <option value="link" ${type === 'link' ? 'selected' : ''}>Worth Reading</option>
                        <option value="youtube" ${type === 'youtube' ? 'selected' : ''}>YouTube Video</option>
                        <option value="instagram" ${type === 'instagram' ? 'selected' : ''}>Instagram Post</option>
                        <option value="podcast" ${type === 'podcast' ? 'selected' : ''}>Podcast URL</option>
                    </select>
                </div>
                <div style="margin-bottom:8px;">
                    <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">Title / Caption</label>
                    <input type="text" class="mediaTitle" value="${item.title || ''}" style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
                </div>
                <div>
                    <label style="display:block; color:rgba(255,255,255,0.5); font-size:10px; margin-bottom:3px; text-transform:uppercase;">URL</label>
                    <input type="text" class="mediaUrl" value="${item.url || ''}" placeholder="https://..." style="width:100%; padding:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:white; font-size:12px; box-sizing:border-box;">
                </div>
            `;
            container.appendChild(mediaBox);
        }

        // Populate Media Container with editable fields
        function populateMediaEditor(media) {
            const container = document.getElementById('mediaEditContainer');
            if (!container) return;
            container.innerHTML = '';
            
            if (!media || media.length === 0) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.5); font-size:12px; margin-bottom:10px;">No media in CSV</div>';
            } else {
                media.forEach(item => addMediaBox(item));
            }

            // Add button if not already present
            if (!document.getElementById('btnAddMedia')) {
                const addBtn = document.createElement('button');
                addBtn.id = 'btnAddMedia';
                addBtn.className = 'btn';
                addBtn.style.cssText = 'width:100%; padding:8px; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.2); color:rgba(255,255,255,0.7); font-size:12px; margin-top:5px;';
                addBtn.textContent = '+ Add Media / Worth Reading';
                addBtn.onclick = () => addMediaBox();
                container.parentElement.appendChild(addBtn);
            }
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
	                    const title = box.querySelector('.eventTitle')?.value || '';
	                    const date = box.querySelector('.eventDate')?.value || '';
	                    const url = box.querySelector('.eventUrl')?.value || '';
	                    if (title || date || url) {
	                        events.push({ title, date, url });
	                    }
                });

	                // 6. Media
	                const media = [];
	                const mediaBoxes = document.querySelectorAll('#mediaEditContainer > div');
		                mediaBoxes.forEach(box => {
		                    const title = box.querySelector('.mediaTitle')?.value || '';
		                    const url = box.querySelector('.mediaUrl')?.value || '';
		                    const type = box.querySelector('.mediaType')?.value || 'link';
		                    if (title || url) {
		                        media.push({ title, url, type });
		                    }
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

                // Safety check for non-JSON response (which causes "Unexpected token <" error)
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const text = await response.text();
                    console.error('Server returned non-JSON response:', text);
                    throw new Error('Server returned an error page. Please check the logs.');
                }

                const data = await response.json();
                if (data.success) {
                    console.log('✅ Dashboard state updated');
                    if (typeof showToast === 'function') showToast('Changes saved and preview updated!', 'success');
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
