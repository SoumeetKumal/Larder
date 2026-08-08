document.addEventListener('DOMContentLoaded', () => {
    const API_KEY = 'larder_local_sync_8f92k';
    const HEADERS = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
    };

    const DEFAULT_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full Body', 'Cardio', 'Other'];
    const DEFAULT_EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Resistance Band', 'Plate', 'Smith Machine', 'EZ Bar', 'Suspension', 'Other'];

    let workoutsListView = localStorage.getItem('larder_workouts_view') || 'list';

    const state = {
        exercises: [],
        templates: [],
        view: 'exercises',
        search: '',
        muscle: 'All',
        equipment: 'All',
        editingExercise: null,
        editingTemplate: null,
        draftDays: []
    };

    const $ = (sel) => document.querySelector(sel);

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function slugify(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    function setStatus(html, cls) {
        const el = $('#wt-status');
        el.innerHTML = html;
        el.style.color = cls ? '#D1777D' : '';
        if (window.lucide) window.lucide.createIcons({ root: el });
    }

    function uniqueValues(arr) {
        return [...new Set(arr.map(v => String(v).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    }

    // --- Data loading ---
    async function loadData(retryCount = 0) {
        try {
            const [exRes, tplRes] = await Promise.all([
                fetch('/api/exercises', { headers: HEADERS }),
                fetch('/api/workout-templates', { headers: HEADERS })
            ]);
            state.exercises = exRes.ok ? await exRes.json() : [];
            state.templates = tplRes.ok ? await tplRes.json() : [];
            if (!Array.isArray(state.exercises)) state.exercises = [];
            if (!Array.isArray(state.templates)) state.templates = [];
            setStatus(`<span class="status-dot"></span> Connected · ${state.exercises.length} exercises · ${state.templates.length} templates`);
            $('#wt-add-btn').classList.remove('hidden');
            render();
        } catch (e) {
            if (retryCount < 5) {
                setTimeout(() => loadData(retryCount + 1), 1000);
                return;
            }
            setStatus('⚠ Could not connect. Run: node server.js', true);
            const list = $('#wt-exercise-list');
            if (list) list.innerHTML = '<div class="empty-state" style="color: #D1777D;">⚠ Could not connect to the local server. Make sure it is running.</div>';
        }
    }

    async function saveArray(endpoint, arr) {
        const res = await fetch(endpoint, {
            method: 'PUT',
            headers: HEADERS,
            body: JSON.stringify(arr)
        });
        if (!res.ok) throw new Error('Save failed: ' + res.status);
        return res.json();
    }

    async function saveExercises() {
        try {
            await saveArray('/api/exercises', state.exercises);
            setStatus(`<span class="status-dot"></span> Saved · ${state.exercises.length} exercises`);
        } catch (e) {
            alert('Save failed. Check the server and try again.');
            loadData();
        }
    }

    async function saveTemplates() {
        try {
            await saveArray('/api/workout-templates', state.templates);
            setStatus(`<span class="status-dot"></span> Saved · ${state.templates.length} templates`);
        } catch (e) {
            alert('Save failed. Check the server and try again.');
            loadData();
        }
    }

    // --- Filters ---
    function buildFilterChips(containerId, values, current, onChange) {
        const container = $(containerId);
        const chips = ['All', ...values];
        container.innerHTML = chips.map(v =>
            `<button type="button" class="filter-chip${v === current ? ' active' : ''}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`
        ).join('');
        container.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => onChange(chip.dataset.val));
        });
    }

    function updateFilterBadge() {
        const badge = $('#wt-filter-badge');
        if (!badge) return;
        const count = (state.muscle !== 'All' ? 1 : 0) + (state.equipment !== 'All' ? 1 : 0);
        badge.textContent = String(count);
        badge.style.display = count > 0 ? 'flex' : 'none';
        const trigger = $('#wt-filter-trigger');
        if (trigger) trigger.classList.toggle('has-filters', count > 0);
    }

    // --- Render exercises ---
    function filteredExercises() {
        const q = state.search.toLowerCase();
        return state.exercises.filter(ex => {
            if (state.muscle !== 'All' && (ex.primaryMuscle || 'Other') !== state.muscle) return false;
            if (state.equipment !== 'All' && (ex.equipment || 'Other') !== state.equipment) return false;
            if (q) {
                const hay = `${ex.name || ''} ${ex.primaryMuscle || ''} ${ex.secondaryMuscles || ''} ${ex.equipment || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function renderExercises() {
        const list = $('#wt-exercise-list');
        const exs = filteredExercises();
        const muscles = uniqueValues(state.exercises.map(ex => ex.primaryMuscle || 'Other'));
        buildFilterChips('#wt-filter-muscle-chips', [...new Set([...DEFAULT_MUSCLES, ...muscles])], state.muscle, (v) => { state.muscle = v; renderExercises(); });
        const equipments = uniqueValues(state.exercises.map(ex => ex.equipment || 'Other'));
        buildFilterChips('#wt-filter-equipment-chips', [...new Set([...DEFAULT_EQUIPMENT, ...equipments])], state.equipment, (v) => { state.equipment = v; renderExercises(); });
        updateFilterBadge();

        if (!exs.length) {
            list.innerHTML = '<div class="wt-empty"><i data-lucide="dumbbell" style="width: 40px; height: 40px;"></i><p>No exercises found.</p><small>Click the + button to add your first exercise.</small></div>';
            if (window.lucide) window.lucide.createIcons({ root: list });
            return;
        }

        const groups = {};
        exs.forEach(ex => {
            const g = ex.primaryMuscle || 'Other';
            if (!groups[g]) groups[g] = [];
            groups[g].push(ex);
        });
        const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

        if (workoutsListView === 'grid') {
            list.innerHTML = `<div class="wt-grid">` + groupNames.map(group => {
                return groups[group].map(ex => `
                    <div class="wt-card" data-id="${escapeHtml(ex.exerciseId || '')}">
                        <div class="wt-card-head">
                            <div>
                                <div class="wt-card-title">${escapeHtml(ex.name)}</div>
                                <div class="wt-tags" style="margin-top: 0.3rem;">
                                    <span class="wt-tag">${escapeHtml(ex.primaryMuscle || 'Other')}</span>
                                    ${(ex.equipment || '').trim() ? `<span class="wt-tag muted">${escapeHtml(ex.equipment)}</span>` : ''}
                                    ${(ex.level || '').trim() ? `<span class="wt-tag muted">${escapeHtml(ex.level)}</span>` : ''}
                                </div>
                            </div>
                            <div class="wt-row-actions">
                                <button type="button" class="wt-icon-btn wt-ex-edit" title="Edit" aria-label="Edit"><i data-lucide="pencil" style="width: 15px; height: 15px;"></i></button>
                                <button type="button" class="wt-icon-btn danger wt-ex-delete" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                            </div>
                        </div>
                        ${(ex.instructions || '').trim() ? `<div class="wt-row-sub" style="margin-top: 0.5rem;">${escapeHtml(ex.instructions)}</div>` : ''}
                    </div>
                `).join('');
            }).join('') + `</div>`;
        } else {
            list.innerHTML = groupNames.map(group => {
                const rows = groups[group].map(ex => `
                    <div class="wt-row" data-id="${escapeHtml(ex.exerciseId || '')}">
                        <div class="wt-row-main">
                            <div class="wt-row-title">${escapeHtml(ex.name)}</div>
                            <div class="wt-tags">
                                <span class="wt-tag">${escapeHtml(ex.primaryMuscle || 'Other')}</span>
                                ${(ex.equipment || '').trim() ? `<span class="wt-tag muted">${escapeHtml(ex.equipment)}</span>` : ''}
                                ${(ex.secondaryMuscles || '').trim() ? `<span class="wt-tag muted">${escapeHtml(ex.secondaryMuscles)}</span>` : ''}
                                ${(ex.level || '').trim() ? `<span class="wt-tag muted">${escapeHtml(ex.level)}</span>` : ''}
                                ${(ex.forceType || '').trim() ? `<span class="wt-tag muted">${escapeHtml(ex.forceType)}</span>` : ''}
                            </div>
                            ${(ex.instructions || '').trim() ? `<div class="wt-row-sub">${escapeHtml(ex.instructions)}</div>` : ''}
                        </div>
                        <div class="wt-row-actions">
                            <button type="button" class="wt-icon-btn wt-ex-edit" title="Edit" aria-label="Edit"><i data-lucide="pencil" style="width: 15px; height: 15px;"></i></button>
                            <button type="button" class="wt-icon-btn danger wt-ex-delete" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                        </div>
                    </div>
                `).join('');
                return `
                    <div class="wt-ex-group">
                        <div class="wt-ex-group-head">
                            <h3>${escapeHtml(group)}</h3>
                            <span class="wt-ex-group-count">${groups[group].length}</span>
                        </div>
                        <div class="wt-list">${rows}</div>
                    </div>
                `;
            }).join('');
        }

        list.querySelectorAll('.wt-ex-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const ex = state.exercises.find(e => e.exerciseId === btn.closest('[data-id]').dataset.id);
                if (ex) openExerciseModal(ex);
            });
        });
        list.querySelectorAll('.wt-ex-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const ex = state.exercises.find(e => e.exerciseId === btn.closest('[data-id]').dataset.id);
                if (ex) deleteExercise(ex);
            });
        });
        if (window.lucide) window.lucide.createIcons({ root: list });
    }

    // --- Render templates ---
    function filteredTemplates() {
        const q = state.search.toLowerCase();
        if (!q) return state.templates;
        return state.templates.filter(t =>
            `${t.name || ''} ${t.description || ''}`.toLowerCase().includes(q)
        );
    }

    function renderTemplates() {
        const list = $('#wt-template-list');
        const tpls = filteredTemplates();
        if (!tpls.length) {
            list.innerHTML = '<div class="wt-empty"><i data-lucide="calendar-range" style="width: 40px; height: 40px;"></i><p>No workout templates yet.</p><small>Group exercises into days (Push, Pull, Legs...) and FitTrack can sync them.</small><button type="button" class="btn primary wt-empty-add" style="margin-top: 0.9rem;"><i data-lucide="plus" style="width: 16px; height: 16px;"></i>Create your first template</button></div>';
            if (window.lucide) window.lucide.createIcons({ root: list });
            const addBtn = list.querySelector('.wt-empty-add');
            if (addBtn) addBtn.addEventListener('click', () => openTemplateModal(null));
            return;
        }

        list.innerHTML = `<div class="wt-grid">${tpls.map((t, i) => {
            const days = Array.isArray(t.days) ? t.days : [];
            const exCount = days.reduce((n, d) => n + (Array.isArray(d.exercises) ? d.exercises.length : 0), 0);
            const dayPreviews = days.slice(0, 4).map(d => {
                const names = (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 4)
                    .map(e => escapeHtml(e.name)).join(', ');
                return `<div class="wt-card-day">
                    <div class="wt-card-day-name">${escapeHtml(d.name || 'Day')}</div>
                    <div class="wt-card-day-ex">${names || '<em>No exercises</em>'}</div>
                </div>`;
            }).join('');
            return `
                <div class="wt-card">
                    <div class="wt-card-head">
                        <div>
                            <div class="wt-card-title">${escapeHtml(t.name)}</div>
                            <div class="wt-card-meta">
                                ${t.durationWeeks ? `<span>${escapeHtml(t.durationWeeks)} weeks</span>` : ''}
                                <span>${days.length} day${days.length === 1 ? '' : 's'}</span>
                                <span>${exCount} exercise${exCount === 1 ? '' : 's'}</span>
                            </div>
                        </div>
                        <div class="wt-row-actions">
                            <button type="button" class="wt-icon-btn wt-tpl-edit" title="Edit" aria-label="Edit"><i data-lucide="pencil" style="width: 15px; height: 15px;"></i></button>
                            <button type="button" class="wt-icon-btn danger wt-tpl-delete" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                        </div>
                    </div>
                    ${t.description ? `<div class="wt-row-sub">${escapeHtml(t.description)}</div>` : ''}
                    <div class="wt-card-days">${dayPreviews}</div>
                </div>
            `;
        }).join('')}</div>`;

        list.querySelectorAll('.wt-tpl-edit').forEach((btn, i) => {
            btn.addEventListener('click', () => openTemplateModal(tpls[i]));
        });
        list.querySelectorAll('.wt-tpl-delete').forEach((btn, i) => {
            btn.addEventListener('click', () => deleteTemplate(tpls[i]));
        });
        if (window.lucide) window.lucide.createIcons({ root: list });
    }

    function render() {
        $('#wt-header-title').textContent = state.view === 'exercises' ? 'Exercises' : 'Workout Templates';
        $('#wt-exercises-view').style.display = state.view === 'exercises' ? '' : 'none';
        $('#wt-templates-view').style.display = state.view === 'templates' ? '' : 'none';
        const addBtn = $('#wt-add-btn');
        if (addBtn) addBtn.title = state.view === 'templates' ? 'Add template' : 'Add exercise';
        document.querySelectorAll('.wt-subtab').forEach(t => t.classList.toggle('active', t.dataset.view === state.view));
        if (state.view === 'exercises') renderExercises();
        else renderTemplates();
    }

    // --- Confirm dialog ---
    function showConfirm(title, message, okLabel = 'Delete') {
        return new Promise((resolve) => {
            const dialog = $('#confirm-dialog');
            $('#confirm-dialog-title').textContent = title;
            $('#confirm-dialog-message').textContent = message;
            $('#confirm-dialog-ok').textContent = okLabel;
            dialog.classList.add('active');
            document.body.style.overflow = 'hidden';
            function cleanup() {
                dialog.classList.remove('active');
                document.body.style.overflow = '';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                dialog.removeEventListener('click', onBackdrop);
            }
            function onOk() { cleanup(); resolve(true); }
            function onCancel() { cleanup(); resolve(false); }
            function onBackdrop(e) { if (e.target === dialog) { cleanup(); resolve(false); } }
            const okBtn = $('#confirm-dialog-ok');
            const cancelBtn = $('#confirm-dialog-cancel');
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            dialog.addEventListener('click', onBackdrop);
        });
    }

    function closeModals() {
        document.querySelectorAll('#wt-ex-modal, #wt-tpl-modal').forEach(m => m.classList.remove('active'));
        document.body.style.overflow = '';
    }
    document.querySelectorAll('.wt-modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    // --- Exercise CRUD ---
    function openExerciseModal(ex) {
        state.editingExercise = ex || null;
        $('#wt-ex-modal-title').textContent = ex ? 'Edit Exercise' : 'New Exercise';
        $('#wt-ex-name').value = ex ? ex.name || '' : '';
        $('#wt-ex-primary').value = ex ? ex.primaryMuscle || '' : '';
        $('#wt-ex-secondary').value = ex ? ex.secondaryMuscles || '' : '';
        $('#wt-ex-equipment').value = ex ? ex.equipment || '' : '';
        $('#wt-ex-level').value = ex && ex.level ? ex.level : 'beginner';
        $('#wt-ex-force').value = ex ? ex.forceType || '' : '';
        $('#wt-ex-instructions').value = ex ? ex.instructions || '' : '';
        $('#wt-ex-delete').style.display = ex ? 'inline-flex' : 'none';
        $('#wt-ex-modal').classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => $('#wt-ex-name').focus(), 50);
    }

    function saveExerciseFromModal() {
        const name = $('#wt-ex-name').value.trim();
        if (!name) { alert('Exercise name is required.'); return; }
        const data = {
            name,
            primaryMuscle: $('#wt-ex-primary').value.trim() || 'Other',
            secondaryMuscles: $('#wt-ex-secondary').value.trim() || null,
            equipment: $('#wt-ex-equipment').value.trim() || null,
            level: $('#wt-ex-level').value || null,
            forceType: $('#wt-ex-force').value || null,
            instructions: $('#wt-ex-instructions').value.trim() || null
        };
        if (state.editingExercise) {
            const idx = state.exercises.findIndex(e => e.exerciseId === state.editingExercise.exerciseId);
            if (idx >= 0) {
                state.exercises[idx] = { ...state.exercises[idx], ...data };
            } else {
                data.exerciseId = slugify(name);
                state.exercises.push(data);
            }
        } else {
            data.exerciseId = slugify(name);
            state.exercises.push(data);
        }
        closeModals();
        renderExercises();
        saveExercises();
    }

    async function deleteExercise(ex) {
        const ok = await showConfirm('Delete exercise', `Delete "${ex.name}" from the exercise library? Existing FitTrack logs are not affected.`);
        if (!ok) return;
        state.exercises = state.exercises.filter(e => e.exerciseId !== ex.exerciseId);
        renderExercises();
        saveExercises();
    }

    // --- Template CRUD ---
    function openTemplateModal(tpl) {
        state.editingTemplate = tpl || null;
        $('#wt-tpl-modal-title').textContent = tpl ? 'Edit Workout Template' : 'New Workout Template';
        $('#wt-tpl-name').value = tpl ? tpl.name || '' : '';
        $('#wt-tpl-desc').value = tpl ? tpl.description || '' : '';
        $('#wt-tpl-weeks').value = tpl && tpl.durationWeeks ? tpl.durationWeeks : '';
        state.draftDays = (tpl && Array.isArray(tpl.days)) ? JSON.parse(JSON.stringify(tpl.days)) : [];
        if (!state.draftDays.length) state.draftDays.push(newDay(1));
        $('#wt-tpl-delete').style.display = tpl ? 'inline-flex' : 'none';
        renderDays();
        $('#wt-tpl-modal').classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => $('#wt-tpl-name').focus(), 50);
    }

    function newDay(n) {
        return { dayId: 'd-' + Date.now() + '-' + n, name: `Day ${n}`, isRestDay: false, exercises: [] };
    }

    function renderDays() {
        const container = $('#wt-tpl-days');
        const names = uniqueValues(state.exercises.map(e => e.name));
        container.innerHTML = state.draftDays.map((day, di) => `
            <div class="wt-day-block">
                <div class="wt-day-head">
                    <span class="wt-day-num">${di + 1}</span>
                    <input type="text" class="wt-day-name" value="${escapeHtml(day.name || '')}" placeholder="Day name (e.g. Push)">
                    <button type="button" class="wt-remove wt-day-remove" title="Remove day" aria-label="Remove day"><i data-lucide="x" style="width: 16px; height: 16px;"></i></button>
                </div>
                <div class="wt-day-exercises">
                    ${(day.exercises || []).map((ex, ei) => `
                        <div class="wt-ex-row" data-di="${di}" data-ei="${ei}">
                            <input type="text" class="wt-ex-name" list="wt-all-exercise-names" value="${escapeHtml(ex.name || '')}" placeholder="Exercise">
                            <input type="number" class="wt-ex-sets" value="${ex.sets != null ? ex.sets : ''}" placeholder="Sets" min="0">
                            <input type="number" class="wt-ex-repsmin" value="${ex.repsMin != null ? ex.repsMin : ''}" placeholder="Min" min="0">
                            <input type="number" class="wt-ex-repsmax" value="${ex.repsMax != null ? ex.repsMax : ''}" placeholder="Max" min="0">
                            <input type="number" class="wt-ex-rest" value="${ex.restSeconds != null ? ex.restSeconds : ''}" placeholder="Rest s" min="0">
                            <button type="button" class="wt-remove wt-ex-remove" title="Remove exercise" aria-label="Remove exercise"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                        </div>
                    `).join('')}
                </div>
                <div style="padding: 0.5rem 0.8rem; border-top: 1px solid var(--border);">
                    <button type="button" class="btn secondary" style="padding: 0.35rem 0.8rem; font-size: 0.78rem;" data-di="${di}"><i data-lucide="plus" style="width: 14px; height: 14px;"></i> Add Exercise</button>
                </div>
            </div>
        `).join('') +
        `<datalist id="wt-all-exercise-names">${names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>`;

        container.querySelectorAll('.wt-day-name').forEach((input, di) => {
            input.addEventListener('input', () => { state.draftDays[di].name = input.value; });
        });
        container.querySelectorAll('.wt-day-remove').forEach((btn, di) => {
            btn.addEventListener('click', () => {
                state.draftDays.splice(di, 1);
                if (!state.draftDays.length) state.draftDays.push(newDay(1));
                renderDays();
                if (window.lucide) window.lucide.createIcons();
            });
        });
        container.querySelectorAll('.wt-ex-name').forEach(input => {
            input.addEventListener('input', () => {
                const row = input.closest('.wt-ex-row');
                const d = state.draftDays[+row.dataset.di];
                d.exercises[+row.dataset.ei].name = input.value;
            });
        });
        container.querySelectorAll('.wt-ex-sets').forEach(input => {
            input.addEventListener('input', () => {
                const row = input.closest('.wt-ex-row');
                state.draftDays[+row.dataset.di].exercises[+row.dataset.ei].sets = input.value === '' ? null : Number(input.value);
            });
        });
        container.querySelectorAll('.wt-ex-repsmin').forEach(input => {
            input.addEventListener('input', () => {
                const row = input.closest('.wt-ex-row');
                state.draftDays[+row.dataset.di].exercises[+row.dataset.ei].repsMin = input.value === '' ? null : Number(input.value);
            });
        });
        container.querySelectorAll('.wt-ex-repsmax').forEach(input => {
            input.addEventListener('input', () => {
                const row = input.closest('.wt-ex-row');
                state.draftDays[+row.dataset.di].exercises[+row.dataset.ei].repsMax = input.value === '' ? null : Number(input.value);
            });
        });
        container.querySelectorAll('.wt-ex-rest').forEach(input => {
            input.addEventListener('input', () => {
                const row = input.closest('.wt-ex-row');
                state.draftDays[+row.dataset.di].exercises[+row.dataset.ei].restSeconds = input.value === '' ? null : Number(input.value);
            });
        });
        container.querySelectorAll('.wt-ex-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.wt-ex-row');
                state.draftDays[+row.dataset.di].exercises.splice(+row.dataset.ei, 1);
                renderDays();
                if (window.lucide) window.lucide.createIcons();
            });
        });
        container.querySelectorAll('button[data-di]').forEach(btn => {
            btn.addEventListener('click', () => {
                const di = +btn.dataset.di;
                state.draftDays[di].exercises.push({ name: '', sets: null, repsMin: null, repsMax: null, targetWeightKg: null, restSeconds: null });
                renderDays();
                if (window.lucide) window.lucide.createIcons();
            });
        });
        if (window.lucide) window.lucide.createIcons({ root: container });
    }

    function saveTemplateFromModal() {
        const name = $('#wt-tpl-name').value.trim();
        if (!name) { alert('Template name is required.'); return; }
        const cleanedDays = state.draftDays
            .filter(d => (d.exercises || []).some(e => (e.name || '').trim()))
            .map(d => ({
                dayId: d.dayId || 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                name: (d.name || '').trim() || 'Day',
                isRestDay: !!d.isRestDay,
                exercises: (d.exercises || [])
                    .filter(e => (e.name || '').trim())
                    .map(e => ({
                        name: e.name.trim(),
                        sets: e.sets || null,
                        repsMin: e.repsMin || null,
                        repsMax: e.repsMax || null,
                        targetWeightKg: e.targetWeightKg || null,
                        restSeconds: e.restSeconds || null
                    }))
            }));
        if (!cleanedDays.length) { alert('Add at least one day with an exercise.'); return; }
        const data = {
            name,
            description: $('#wt-tpl-desc').value.trim() || null,
            durationWeeks: $('#wt-tpl-weeks').value ? Number($('#wt-tpl-weeks').value) : null,
            days: cleanedDays
        };
        if (state.editingTemplate) {
            const idx = state.templates.findIndex(t => t.templateId === state.editingTemplate.templateId);
            if (idx >= 0) {
                state.templates[idx] = { ...state.templates[idx], ...data };
            } else {
                data.templateId = slugify(name);
                state.templates.push(data);
            }
        } else {
            data.templateId = slugify(name);
            state.templates.push(data);
        }
        closeModals();
        renderTemplates();
        saveTemplates();
    }

    async function deleteTemplate(tpl) {
        const ok = await showConfirm('Delete template', `Delete workout template "${tpl.name}"?`);
        if (!ok) return;
        state.templates = state.templates.filter(t => t.templateId !== tpl.templateId);
        renderTemplates();
        saveTemplates();
    }

    // --- Events ---
    document.querySelectorAll('.wt-subtab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.view = tab.dataset.view;
            state.muscle = 'All';
            state.equipment = 'All';
            state.search = '';
            $('#wt-search').value = '';
            $('#wt-search-wrap').classList.remove('active');
            $('#wt-search-trigger').style.opacity = '';
            
            const viewToggleBtn = $('#wt-view-toggle');
            if (viewToggleBtn) {
                viewToggleBtn.style.display = state.view === 'exercises' ? '' : 'none';
            }
            
            render();
        });
    });

    const viewToggleBtn = $('#wt-view-toggle');
    if (viewToggleBtn) {
        const updateIcon = () => {
            const iconName = workoutsListView === 'grid' ? 'layout-grid' : 'list';
            viewToggleBtn.innerHTML = `<i data-lucide="${iconName}" style="width: 18px; height: 18px;" id="wt-view-toggle-icon"></i>`;
            if (window.lucide) window.lucide.createIcons();
        };
        updateIcon();
        
        viewToggleBtn.addEventListener('click', () => {
            workoutsListView = workoutsListView === 'grid' ? 'list' : 'grid';
            localStorage.setItem('larder_workouts_view', workoutsListView);
            updateIcon();
            if (state.view === 'exercises') renderExercises();
        });
    }

    const searchInput = $('#wt-search');
    const searchTrigger = $('#wt-search-trigger');
    const searchWrap = $('#wt-search-wrap');
    searchInput.addEventListener('input', () => {
        state.search = searchInput.value;
        if (state.view === 'exercises') renderExercises();
        else renderTemplates();
    });
    searchTrigger.addEventListener('click', () => {
        searchWrap.classList.add('active');
        searchTrigger.style.opacity = '0';
        searchInput.focus();
    });
    $('#wt-search-close').addEventListener('click', () => {
        searchWrap.classList.remove('active');
        searchTrigger.style.opacity = '';
        searchInput.value = '';
        state.search = '';
        if (state.view === 'exercises') renderExercises();
        else renderTemplates();
    });
    document.addEventListener('click', (e) => {
        if (!searchWrap.contains(e.target) && !searchTrigger.contains(e.target)) {
            searchWrap.classList.remove('active');
            searchTrigger.style.opacity = '';
        }
    });

    const filterTrigger = $('#wt-filter-trigger');
    const filterDropdown = $('#wt-filter-dropdown');
    if (filterTrigger && filterDropdown) {
        filterTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (filterDropdown.classList.contains('active') && !filterDropdown.contains(e.target) && e.target !== filterTrigger && !(filterTrigger && filterTrigger.contains(e.target))) {
                filterDropdown.classList.remove('active');
            }
        });
        const filterReset = $('#wt-filter-reset');
        if (filterReset) {
            filterReset.addEventListener('click', () => {
                state.muscle = 'All';
                state.equipment = 'All';
                renderExercises();
            });
        }
    }

    $('#wt-add-btn').addEventListener('click', () => {
        if (state.view === 'templates') openTemplateModal(null);
        else openExerciseModal(null);
    });

    $('#wt-ex-save').addEventListener('click', saveExerciseFromModal);
    $('#wt-ex-delete').addEventListener('click', async () => {
        if (state.editingExercise) await deleteExercise(state.editingExercise);
    });

    $('#wt-tpl-save').addEventListener('click', saveTemplateFromModal);
    $('#wt-tpl-add-day').addEventListener('click', () => {
        state.draftDays.push(newDay(state.draftDays.length + 1));
        renderDays();
        if (window.lucide) window.lucide.createIcons();
    });
    $('#wt-tpl-delete').addEventListener('click', async () => {
        if (state.editingTemplate) await deleteTemplate(state.editingTemplate);
    });

    // Populate muscle/equipment datalists with defaults
    const muscleList = $('#wt-muscle-list');
    muscleList.innerHTML = DEFAULT_MUSCLES.map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
    const equipmentList = $('#wt-equipment-list');
    equipmentList.innerHTML = DEFAULT_EQUIPMENT.map(e => `<option value="${escapeHtml(e)}"></option>`).join('');

    loadData();
});
