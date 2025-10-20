document.addEventListener('DOMContentLoaded', () => {

    const dom = {
        categoryList: document.getElementById('category-list'),
        addCategoryBtn: document.getElementById('add-category-btn'),
        noteList: document.getElementById('note-list'),
        newNoteBtn: document.getElementById('new-note-btn'),
        searchInput: document.getElementById('search-input'),
        currentCategoryTitle: document.getElementById('current-category-title'),
        editorWorkspace: document.getElementById('editor-workspace'),
        emptyEditorView: document.getElementById('empty-editor-view'),
        noteTitleInput: document.getElementById('note-title-input'),
        deleteNoteBtn: document.getElementById('delete-note-btn'),
        noteStatusSelect: document.getElementById('note-status-select'),
        exportBtn: document.getElementById('export-btn'),
        importBtn: document.getElementById('import-btn'),
        importFileInput: document.getElementById('import-file-input'),
        editorPanel: document.querySelector('.editor-panel')
    };

    let state = {
        notes: [],
        categories: [],
        currentCategoryId: 'all',
        currentNoteId: null,
    };
    
    let quill;

    const notesStore = localforage.createInstance({ name: 'stableNotesApp_Notes' });
    const categoriesStore = localforage.createInstance({ name: 'stableNotesApp_Categories' });

    const initializeEditor = () => {
        try {
            Quill.register('modules/imageResize', window.ImageResize.default);

            const Parchment = Quill.import('parchment');
            
            const LineHeightStyle = new Parchment.Attributor.Style('lineHeight', 'line-height', { 
                scope: Parchment.Scope.BLOCK, 
                whitelist: ['1', '1.5', '2', '2.5'] 
            });
            const LetterSpacingStyle = new Parchment.Attributor.Style('letterSpacing', 'letter-spacing', { 
                scope: Parchment.Scope.INLINE, 
                whitelist: ['normal', '1px', '2px'] 
            });
            
            Quill.register(LineHeightStyle, true);
            Quill.register(LetterSpacingStyle, true);

            const BlockEmbed = Quill.import('blots/block/embed');
            class HorizontalRule extends BlockEmbed {}
            HorizontalRule.blotName = 'hr';
            HorizontalRule.tagName = 'hr';
            Quill.register(HorizontalRule);

            quill = new Quill('#editor-container', {
                bounds: dom.editorPanel,
                theme: 'snow',
                modules: {
                    imageResize: {
                        parchment: Quill.import('parchment'),
                        modules: ['Resize', 'DisplaySize']
                    },
                    syntax: { highlight: text => hljs.highlightAuto(text).value },
                    toolbar: {
                        container: '#toolbar-container',
                        handlers: {
                            'hr': function() {
                                const range = this.quill.getSelection(true);
                                this.quill.insertText(range.index, '\n', Quill.sources.USER);
                                this.quill.insertEmbed(range.index + 1, 'hr', true, Quill.sources.USER);
                                this.quill.setSelection(range.index + 2, Quill.sources.SILENT);
                            },
                            'image': function() {
                                const input = document.createElement('input');
                                input.setAttribute('type', 'file');
                                input.setAttribute('accept', 'image/*');
                                input.click();
                                input.onchange = () => {
                                    const file = input.files[0];
                                    if (!file) return;
                                    if (/^image\//.test(file.type)) {
                                        const reader = new FileReader();
                                        reader.onload = (e) => {
                                            const range = this.quill.getSelection(true);
                                            this.quill.insertEmbed(range.index, 'image', e.target.result, Quill.sources.USER);
                                        };
                                        reader.readAsDataURL(file);
                                    } else {
                                        alert('请选择一个图片文件。');
                                    }
                                };
                            }
                        }
                    }
                },
                placeholder: '在这里开始记录你的想法...'
            });
            return true;
        } catch (error) {
            console.error("编辑器初始化失败! 请检查Quill, Highlight.js等库是否成功加载。", error);
            document.body.innerHTML = `<div style="padding: 40px; text-align: center; font-size: 18px; color: red; font-family: sans-serif;">
                <h1>加载失败</h1>
                <p>无法初始化应用。请确保您已连接到互联网，并且浏览器没有阻止外部脚本加载。</p>
                <p>请按 F12 打开开发者工具，查看 Console (控制台) 中的详细错误信息。</p>
            </div>`;
            return false;
        }
    };

    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const saveData = async () => {
        await notesStore.setItem('allNotes', state.notes);
        await categoriesStore.setItem('allCategories', state.categories);
    };

    const loadData = async () => {
        const [notes, categories] = await Promise.all([
            notesStore.getItem('allNotes'),
            categoriesStore.getItem('allCategories')
        ]);
        state.notes = notes || [];
        state.categories = categories || [];
    };

    const render = () => {
        renderCategories();
        renderNoteList();
        renderEditor();
    };

    const renderCategories = () => {
        dom.categoryList.innerHTML = '';
        const allNotesItem = document.createElement('li');
        allNotesItem.className = `category-item ${state.currentCategoryId === 'all' ? 'active' : ''}`;
        allNotesItem.dataset.id = 'all';
        allNotesItem.textContent = '所有笔记';
        dom.categoryList.appendChild(allNotesItem);

        state.categories.forEach(cat => {
            const li = document.createElement('li');
            li.className = `category-item ${state.currentCategoryId === cat.id ? 'active' : ''}`;
            li.dataset.id = cat.id;
            li.textContent = cat.name;
            dom.categoryList.appendChild(li);
        });
    };

    const renderNoteList = () => {
        const searchTerm = dom.searchInput.value.toLowerCase();
        let filteredNotes;

        if (searchTerm) {
            filteredNotes = state.notes.filter(n => n.title.toLowerCase().includes(searchTerm) || (n.plainText && n.plainText.toLowerCase().includes(searchTerm)));
            dom.currentCategoryTitle.textContent = `搜索结果`;
        } else if (state.currentCategoryId !== 'all') {
            filteredNotes = state.notes.filter(n => n.categoryId === state.currentCategoryId);
            const category = state.categories.find(c => c.id === state.currentCategoryId);
            dom.currentCategoryTitle.textContent = category ? category.name : '所有笔记';
        } else {
            filteredNotes = state.notes;
            dom.currentCategoryTitle.textContent = '所有笔记';
        }

        filteredNotes.sort((a, b) => b.updatedAt - a.updatedAt);
        dom.noteList.innerHTML = '';

        if (filteredNotes.length === 0) {
            dom.noteList.innerHTML = `<p class="empty-list-msg">${searchTerm ? '未找到匹配的笔记' : '这个分类下没有笔记'}</p>`;
        } else {
            filteredNotes.forEach(note => {
                const item = document.createElement('div');
                item.className = `note-item ${note.id === state.currentNoteId ? 'active' : ''}`;
                item.dataset.id = note.id;
                const statusMap = { 'draft': '草稿', 'in-progress': '进行中', 'completed': '已完成' };
                item.innerHTML = `
                    <div class="note-status-badge ${note.status}">${statusMap[note.status] || '草稿'}</div>
                    <h4 class="note-item-title">${note.title || '无标题笔记'}</h4>
                    <p class="note-item-snippet">${note.plainText || '没有内容...'}</p>`;
                dom.noteList.appendChild(item);
            });
        }
    };

    const renderEditor = () => {
        const note = state.notes.find(n => n.id === state.currentNoteId);
        if (note && quill) {
            dom.editorWorkspace.classList.remove('hidden');
            dom.emptyEditorView.classList.add('hidden');
            quill.enable();
            
            quill.off('text-change', debouncedSaveContent);

            dom.noteTitleInput.value = note.title;
            dom.noteStatusSelect.value = note.status || 'draft';
            if (note.content) quill.setContents(note.content); else quill.setText('');
            
            quill.on('text-change', debouncedSaveContent);
        } else {
            dom.editorWorkspace.classList.add('hidden');
            dom.emptyEditorView.classList.remove('hidden');
            if (quill) quill.disable();
        }
    };
    
    const addCategory = async () => {
        const name = prompt('请输入新分类的名称：');
        if (name && name.trim()) {
            const newCategory = { id: `cat-${Date.now()}`, name: name.trim() };
            state.categories.push(newCategory);
            await saveData();
            renderCategories();
        }
    };

    const addNote = async () => {
        const newNote = {
            id: `note-${Date.now()}`,
            title: '无标题笔记',
            content: { ops: [{ insert: '\n' }] },
            plainText: '',
            categoryId: state.currentCategoryId === 'all' ? null : state.currentCategoryId,
            status: 'draft',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        state.notes.unshift(newNote);
        state.currentNoteId = newNote.id;
        await saveData();
        render();
    };

    const deleteNote = async () => {
        if (!state.currentNoteId || !confirm('您确定要删除这篇笔记吗？此操作无法撤销。')) return;

        state.notes = state.notes.filter(n => n.id !== state.currentNoteId);
        state.currentNoteId = null;
        await saveData();
        render();
    };

    const saveContent = () => {
        if (!quill || !state.currentNoteId) return;
        const note = state.notes.find(n => n.id === state.currentNoteId);
        if (note) {
            note.content = quill.getContents();
            note.plainText = quill.getText(0, 100).replace(/\n/g, ' ').trim();
            note.updatedAt = Date.now();
            saveData().then(renderNoteList);
        }
    };
    const debouncedSaveContent = debounce(saveContent, 500);

    const saveTitle = () => {
        const note = state.notes.find(n => n.id === state.currentNoteId);
        if (note) {
            note.title = dom.noteTitleInput.value;
            note.updatedAt = Date.now();
            saveData().then(renderNoteList);
        }
    };
    const debouncedSaveTitle = debounce(saveTitle, 300);

    const saveStatus = async () => {
        const note = state.notes.find(n => n.id === state.currentNoteId);
        if (note) {
            note.status = dom.noteStatusSelect.value;
            note.updatedAt = Date.now();
            await saveData();
            renderNoteList();
        }
    };
    
    const exportData = async () => {
        if (state.notes.length === 0 && state.categories.length === 0) {
            alert("没有数据可以导出。");
            return;
        }
        const dataToExport = { notes: state.notes, categories: state.categories };
        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || !Array.isArray(data.notes) || !Array.isArray(data.categories)) {
                    throw new Error('无效的备份文件格式。');
                }
                if (confirm('您确定要导入数据吗？这将覆盖所有现有笔记和分类！')) {
                    state.notes = data.notes;
                    state.categories = data.categories;
                    state.currentCategoryId = 'all';
                    state.currentNoteId = null;
                    await saveData();
                    render();
                    alert('数据导入成功！');
                }
            } catch (err) { alert('导入失败: ' + err.message); }
            dom.importFileInput.value = '';
        };
        reader.readAsText(file);
    };

    const bindEvents = () => {
        dom.addCategoryBtn.addEventListener('click', addCategory);
        dom.newNoteBtn.addEventListener('click', addNote);
        dom.deleteNoteBtn.addEventListener('click', deleteNote);
        dom.exportBtn.addEventListener('click', exportData);
        dom.importBtn.addEventListener('click', () => dom.importFileInput.click());
        dom.importFileInput.addEventListener('change', importData);

        dom.categoryList.addEventListener('click', e => {
            if (e.target.matches('.category-item')) {
                state.currentCategoryId = e.target.dataset.id;
                dom.searchInput.value = '';
                state.currentNoteId = null;
                render();
            }
        });

        dom.noteList.addEventListener('click', e => {
            const item = e.target.closest('.note-item');
            if (item) {
                if (state.currentNoteId !== item.dataset.id) {
                    state.currentNoteId = item.dataset.id;
                    render();
                }
            }
        });
        
        dom.searchInput.addEventListener('input', debounce(() => {
            state.currentCategoryId = 'all';
            state.currentNoteId = null;
            render();
        }, 300));
        
        dom.noteTitleInput.addEventListener('input', debouncedSaveTitle);
        dom.noteStatusSelect.addEventListener('change', saveStatus);
        
        dom.editorPanel.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
                e.preventDefault();
                if (confirm(`您要跳转到以下链接吗？\n${link.href}`)) {
                    window.open(link.href, '_blank');
                }
            }
        });
    };

    const main = async () => {
        if (!initializeEditor()) {
            return;
        }
        await loadData();
        bindEvents();
        render();
    };

    main();
});