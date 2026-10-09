window.onerror = function(msg, url, line) {
        showToast("Ошибка кода: строка " + line, true);
        return false;
    };

    const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSe0tKKL8nq1xvlN5UNBvr34XtQSNb2md-d8fmDOtGPVIyinAw/formResponse";

    // ВЕЧНЫЕ КЛЮЧИ ХРАНЕНИЯ
    const DB_KEY = "master_calc_palette_history_final";
    const SETTINGS_KEY = "master_calc_palette_settings_final";
    const TRASH_KEY = 'master_calc_palette_deleted_v2';
    let currentCalc = null;

    const DEFAULT_SETTINGS = Object.freeze({hour:3500, rentStd:320, rentPrem:420, cons:300, mark:0.5,
        pEstel:7.75, pBicolor:11.71, pNuk:19.6, pNukClear:7, pPowder:5, pOxide:1, pBooster:30.4});
    const CONFIG_KEY = 'master_calc_palette_config_v3';
    const BUILTIN_MATERIALS = [
        ['estel','Estel','pEstel','gE'],['bicolor','Bicolor','pBicolor','gB'],['nuk','NUK','pNuk','gN'],
        ['nuk-clear','NUK прозрачный','pNukClear','gNC'],['powder','Пудра','pPowder','gP'],
        ['oxide','Оксид','pOxide','gO'],['booster','Бустер','pBooster','gBoost']
    ];
    let customQuantities = {}, extraExpenses = [];
    function moneyText(value) {return value.toFixed(2).replace(/\.00$/,'').replace('.',',')+' ₽';}
    function renderExtras() {
        document.getElementById('extras-list').innerHTML=extraExpenses.map(e=>`<div class="card"><label for="extra-label-${e.id}">Название расхода</label><input class="search-bar" id="extra-label-${e.id}" value="${escapeHTML(e.name)}" oninput="extraExpenses.find(e=>e.id===${e.id}).name=this.value;scheduleCalculation()"><div class="input-row"><label for="extra-value-${e.id}">Сумма, ₽</label><input id="extra-value-${e.id}" type="number" class="input-control" min="0" step="0.01" value="${escapeHTML(e.amount)}" oninput="extraExpenses.find(e=>e.id===${e.id}).amount=this.value;scheduleCalculation()"><button class="material-remove" onclick="removeExtraExpense(${e.id})" aria-label="Убрать дополнительный расход">×</button></div></div>`).join('');
    }
    function addExtraExpense(){extraExpenses.push({id:extraExpenses.reduce((next,e)=>Math.max(next,e.id+1),Date.now()),name:'',amount:'0'});renderExtras();}
    function removeExtraExpense(id){extraExpenses=extraExpenses.filter(e=>e.id!==id);renderExtras();calculate(false,true);}

    function getConfig() {
        const text = localStorage.getItem(CONFIG_KEY);
        if (!text) return {catalog:BUILTIN_MATERIALS.map(([id,name,rateKey])=>({id,name,unit:'г',price:DEFAULT_SETTINGS[rateKey],pack:1,rateKey,archived:false})), templates:[]};
        const config = JSON.parse(text);
        if (!validConfig(config)) throw new Error('Повреждён каталог или шаблоны. Восстановите резервную копию');
        return config;
    }
    function validConfig(c) {
        return c && Array.isArray(c.catalog) && Array.isArray(c.templates) &&
            new Set(c.catalog.map(i=>i?.id)).size === c.catalog.length && new Set(c.templates.map(t=>t?.id)).size===c.templates.length &&
            c.catalog.every(i=>i && /^[a-z0-9-]+$/.test(i.id) && typeof i.name==='string' && i.name.trim() &&
                ['г','мл','шт'].includes(i.unit) && Number.isFinite(i.price) && i.price>=0 && Number.isFinite(i.pack) && i.pack>0 &&
                typeof i.archived==='boolean' && (!i.rateKey || Object.hasOwn(DEFAULT_SETTINGS,i.rateKey))) &&
            c.templates.every(t=>t && Number.isSafeInteger(t.id) && typeof t.name==='string' && validRaw(t.raw));
    }
    function materialPrice(item,settings=getSettings()) { return item.rateKey ? settings[item.rateKey] : item.price/item.pack; }
    function persistConfig(config) {
        if (!validConfig(config)) throw new Error('Некорректный каталог');
        localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
        refreshCatalog(); refreshTemplates(); invalidateCalculation();
    }
    function refreshCatalog() {
        const config=getConfig();

        document.getElementById('catalog-list').innerHTML=config.catalog.map(i=>`<div class="card"><b>${escapeHTML(i.name)}</b><p class="hint">${materialPrice(i).toFixed(2)} ₽/${escapeHTML(i.unit)}${i.archived?' · Архив':''}</p><button class="btn" onclick="editCatalogItem('${i.id}')">Изменить</button><button class="btn" onclick="archiveCatalogItem('${i.id}')">${i.archived?'Вернуть':'В архив'}</button></div>`).join('');
        renderCustomMaterials();syncMaterials();
        for (const [id] of BUILTIN_MATERIALS) {
            const item=config.catalog.find(i=>i.id===id);
            if (item) {document.querySelector(`label[for="m-${id}"]`).innerText=`${item.name}, ${item.unit}`;document.getElementById('m-'+id).setAttribute('aria-label',`${item.name}, ${item.unit}`);document.getElementById('m-'+id).step=item.unit==='шт'?'1':'0.1';}
        }
    }
    function renderCustomMaterials() {
        document.getElementById('custom-materials').innerHTML=getConfig().catalog.filter(i=>!MATERIAL_KEYS.includes(i.id) && Object.hasOwn(customQuantities,i.id)).map(i=>`<div class="palette-tile"><label for="quantity-${i.id}">${escapeHTML(i.name)}, ${escapeHTML(i.unit)}</label><input id="quantity-${i.id}" class="input-control" type="number" min="0" step="${i.unit==='шт'?'1':'0.1'}" inputmode="decimal" placeholder="0" value="${escapeHTML(customQuantities[i.id])}" oninput="customQuantities['${i.id}']=this.value; scheduleCalculation()"><span class="palette-cost" id="cost-${i.id}">0 ₽</span><button class="palette-custom-remove" onclick="removeMaterial('${i.id}')" aria-label="Убрать ${escapeHTML(i.name)}">×</button></div>`).join('');
    }
    function openMaterialCatalog(){document.getElementById('material-search').value='';renderMaterialChoices();document.getElementById('material-dialog').showModal();document.getElementById('material-search').focus();}
    function renderMaterialChoices(){const query=document.getElementById('material-search').value.trim().toLowerCase();const items=getConfig().catalog.filter(i=>!i.archived&&i.name.toLowerCase().includes(query));document.getElementById('material-choices').innerHTML=items.map(i=>`<button class="material-choice" onclick="chooseMaterial('${i.id}')"><b>${escapeHTML(i.name)}</b><span>${materialPrice(i).toFixed(2)} ₽/${escapeHTML(i.unit)}</span></button>`).join('')||'<p class="hint">Материалов не найдено</p>';}
    function chooseMaterial(key){if(!getConfig().catalog.some(i=>i.id===key&&!i.archived))return;document.getElementById('material-dialog').close();if(!MATERIAL_KEYS.includes(key)){if(!Object.hasOwn(customQuantities,key))customQuantities[key]='';renderCustomMaterials();calculate(false,true);}const field=document.getElementById(MATERIAL_KEYS.includes(key)?'m-'+key:'quantity-'+key);field.focus();field.select();}
    function clearMaterials(){for(const key of MATERIAL_KEYS)document.getElementById('m-'+key).value='';customQuantities={};renderCustomMaterials();syncMaterials();calculate(false,true);}
    function updatePaletteCosts(lines){const costs=new Map(lines.map(i=>[i.id,i.cost]));for(const i of getConfig().catalog){const field=document.getElementById('cost-'+i.id);if(field)field.innerText=moneyText(costs.get(i.id)||0);}document.getElementById('palette-subtotal').innerText='Материалы: '+moneyText(lines.reduce((sum,i)=>sum+i.cost,0));}
    function paletteKeyboard(event){if(event.key!=='Enter'||!event.target.matches('#materials-palette input, #custom-materials input'))return;event.preventDefault();const inputs=[...document.querySelectorAll('#materials-palette input, #custom-materials input')].filter(i=>!i.closest('[hidden]'));const next=inputs[inputs.indexOf(event.target)+1];if(next){next.focus();next.select();}}
    function clearCatalogEditor() { for(const id of ['catalog-id','catalog-name']) document.getElementById(id).value=''; document.getElementById('catalog-price').value=0;document.getElementById('catalog-pack').value=1;document.getElementById('catalog-unit').value='г'; }
    function editCatalogItem(id) { const item=getConfig().catalog.find(i=>i.id===id);if(!item)return;for(const [key,value] of Object.entries({id:item.id,name:item.name,unit:item.unit,price:item.rateKey?materialPrice(item):item.price,pack:item.rateKey?1:item.pack}))document.getElementById('catalog-'+key).value=value; }
    function saveCatalogItem() {
        try { const config=getConfig(), name=document.getElementById('catalog-name').value.trim();if(!name)throw new Error('Введите название');
            const price=readNumber('catalog-price'),pack=readNumber('catalog-pack');if(pack<=0)throw new Error('Количество в упаковке должно быть больше нуля');
            const requested=document.getElementById('catalog-id').value;const id=requested||('custom-'+config.catalog.reduce((next,i)=>Math.max(next,Number(i.id.replace('custom-',''))+1||0),Date.now()));
            const old=config.catalog.find(i=>i.id===id);const item={id,name,unit:document.getElementById('catalog-unit').value,price,pack,archived:old?.archived??false};
            if(old)config.catalog[config.catalog.indexOf(old)]=item;else config.catalog.push(item);
            persistConfig(config);clearCatalogEditor();showToast('Материал сохранён');
        } catch(e) {showToast(e.message,true);}
    }
    function archiveCatalogItem(id) {try{const c=getConfig(),i=c.catalog.find(i=>i.id===id);if(!i)return;i.archived=!i.archived;persistConfig(c);showToast(i.archived?'Материал в архиве. Он остаётся в текущем расчёте, если уже добавлен.':'Материал возвращён');}catch(e){showToast(e.message,true);} }
    function refreshTemplates() {document.getElementById('service-template').innerHTML='<option value="">Выберите услугу</option>'+getConfig().templates.map(t=>`<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');}
    function saveTemplate() { try{if(!calculate(false))return;const name=document.getElementById('template-name').value.trim();if(!name)throw new Error('Введите название шаблона');const c=getConfig();c.templates.push({id:c.templates.reduce((next,t)=>Math.max(next,t.id+1),Date.now()),name,raw:JSON.parse(JSON.stringify(currentCalc.raw))});persistConfig(c);showToast('Шаблон сохранён');}catch(e){showToast(e.message,true);} }
    function deleteTemplate() {try{const id=Number(document.getElementById('service-template').value);if(!id)return;const c=getConfig();c.templates=c.templates.filter(t=>t.id!==id);persistConfig(c);showToast('Шаблон удалён');}catch(e){showToast(e.message,true);} }
    function applyTemplate() {try{const t=getConfig().templates.find(t=>t.id===Number(document.getElementById('service-template').value));if(!t)return;applyRaw(t.raw);calculate(false);showToast('Шаблон применён по текущим тарифам');}catch(e){showToast(e.message,true);} }
    function applyRaw(raw) {
        invalidateCalculation();
        if(!validRaw(raw))throw new Error('Некорректные входные данные чека или шаблона');
        const ids=new Set(getConfig().catalog.map(i=>i.id));
        for(const [id,qty] of Object.entries(raw.customQuantities||{}))if(Number(qty)>0&&!ids.has(id))throw new Error('Материал из шаблона или чека отсутствует в каталоге. Восстановите каталог из резервной копии');
        for(const [id,,,key] of BUILTIN_MATERIALS)if(Number(raw[key])>0&&!ids.has(id))throw new Error('Материал из шаблона или чека отсутствует в каталоге');
        const fields={wTime:'work-time',rTime:'rent-time',cCount:'cons-count',rType:'rent-type',workMode:'work-mode',workFixed:'work-fixed',extraCost:'extra-cost',extraName:'extra-name',taxPercent:'tax-percent',feePercent:'fee-percent'};
        const defaults={wTime:1,rTime:1,cCount:1,rType:'std',workMode:'hourly',rentMode:'hourly',workFixed:3500,rentFixed:320,extraCost:0,extraName:'',taxPercent:0,feePercent:0};
        for(const [key,id] of Object.entries(fields))document.getElementById(id).value=raw[key]??defaults[key];
        for(const [id,,,key] of BUILTIN_MATERIALS)document.getElementById('m-'+id).value=raw[key]||'';
        customQuantities={...(raw.customQuantities||{})};extraExpenses=(raw.extraExpenses||[]).map(e=>({...e}));document.getElementById('cover-deductions').checked=raw.coverDeductions===true;renderExtras();renderCustomMaterials();syncMaterials();
    }
    function syncPaymentModes() {
        document.getElementById('work-fixed-row').hidden=(document.getElementById('work-mode').value||'hourly')!=='fixed';
    }
    function dateKey(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
    function receiptDate(i) {if(/^\d{4}-\d{2}-\d{2}$/.test(i.dateKey||''))return i.dateKey;const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(i.date);return m?`${m[3]}-${m[2]}-${m[1]}`:'';}
    function selectHistoryMonth() {const value=document.getElementById('history-month').value;if(!value){resetHistoryPeriod();return;}const [y,m]=value.split('-').map(Number);document.getElementById('history-from').value=value+'-01';document.getElementById('history-to').value=value+'-'+new Date(y,m,0).getDate();renderHistory();}
    function clearHistoryMonth() {document.getElementById('history-month').value='';renderHistory();}
    function resetHistoryPeriod() {for(const id of ['history-month','history-from','history-to'])document.getElementById(id).value='';renderHistory();}
    let saving = false;
    let quietCalculation = false;
    let calcTimer, historyTimer;
    let historyLimit = 50;
    const MATERIAL_KEYS = ['estel','bicolor','nuk','nuk-clear','powder','oxide','booster'];
    function syncMaterials() {
        const catalog=getConfig().catalog;
        for(const key of MATERIAL_KEYS){const item=catalog.find(i=>i.id===key);document.getElementById('row-'+key).hidden=!item || (item.archived && !(Number(document.getElementById('m-'+key).value)>0));}
    }
    function removeMaterial(key) {
        if(!MATERIAL_KEYS.includes(key)){delete customQuantities[key];renderCustomMaterials();}
        else document.getElementById('m-'+key).value='';
        syncMaterials();calculate(false,true);
    }
    function scheduleCalculation() {
        clearTimeout(calcTimer);
        invalidateCalculation();
        calcTimer = setTimeout(() => calculate(false,true),120);
    }
    function scheduleHistorySearch() {
        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => renderHistory(),180);
    }

    function validRaw(raw) {
        if(!raw || typeof raw!=='object' || Array.isArray(raw))return false;
        const numeric=['wTime','rTime','cCount','gE','gB','gN','gNC','gP','gO','gBoost','workFixed','rentFixed','extraCost','taxPercent','feePercent'];
        if(numeric.some(k=>raw[k]!==undefined && (typeof raw[k]!=='number'||!Number.isFinite(raw[k])||raw[k]<0)))return false;
        if(raw.cCount!==undefined && !Number.isInteger(raw.cCount))return false;
        if(raw.rType!==undefined && !['std','prem'].includes(raw.rType))return false;
        if(raw.workMode!==undefined && !['hourly','fixed'].includes(raw.workMode))return false;
        if(raw.rentMode!==undefined && !['hourly','fixed','none'].includes(raw.rentMode))return false;
        if(raw.extraName!==undefined && typeof raw.extraName!=='string')return false;
        if(raw.coverDeductions!==undefined && typeof raw.coverDeductions!=='boolean')return false;
        if(raw.customQuantities!==undefined && (!raw.customQuantities || typeof raw.customQuantities!=='object'||Array.isArray(raw.customQuantities)||
            Object.entries(raw.customQuantities).some(([id,qty])=>! /^[a-z0-9-]+$/.test(id) || !['number','string'].includes(typeof qty) || String(qty).trim()==='' || !Number.isFinite(Number(qty)) || Number(qty)<0)))return false;
        if(raw.extraExpenses!==undefined && (!Array.isArray(raw.extraExpenses)||new Set(raw.extraExpenses.map(e=>e?.id)).size!==raw.extraExpenses.length||
            raw.extraExpenses.some(e=>!e||!Number.isSafeInteger(e.id)||e.id<=0||typeof e.name!=='string'||typeof e.amount!=='number'||!Number.isFinite(e.amount)||e.amount<0)))return false;
        return (raw.taxPercent||0)+(raw.feePercent||0)<100;
    }
    function validReceipt(i) {
        return i && Number.isSafeInteger(i.id) && i.id > 0 &&
            ['total','exp','workTime'].every(k => typeof i[k] === 'number' && Number.isFinite(i[k]) && i[k] >= 0) && typeof i.profit==='number' && Number.isFinite(i.profit) &&
            ['name','recipe','date'].every(k => typeof i[k] === 'string') && (i.raw===undefined || validRaw(i.raw));
    }
    function readHistory() {
        const h = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
        if (!Array.isArray(h) || !h.every(validReceipt)) throw new Error('Повреждена история: восстановите резервную копию');
        return h;
    }
    function mergeHistory(existing, incoming) {
        return [...new Map([...incoming, ...existing].map(i => [i.id, i])).values()].sort((a,b) => b.id-a.id);
    }
    function normalizeSettings(s) {
        return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k,v]) =>
            [k, typeof s?.[k] === 'number' && Number.isFinite(s[k]) && s[k] >= 0 ? s[k] : v]));
    }
    function readNumber(id, integer = false, allowEmpty = false) {
        const field = document.getElementById(id);
        const text = field.value.trim().replace(',', '.');
        const value = Number(text);
        const ok = !field.validity?.badInput && (text !== '' || allowEmpty) && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value));
        field.setAttribute('aria-invalid', String(!ok));
        field.style.borderColor = ok ? '' : 'var(--danger)';
        if (!ok) { if (!quietCalculation) field.focus(); throw new Error(integer ? 'Введите целое неотрицательное количество' : 'Введите неотрицательное число в выделенном поле'); }
        return value;
    }
    function invalidateCalculation() {
        currentCalc = null;
        document.getElementById('res-box').style.display = 'none';
        document.getElementById('quick-total').innerText = '—';
        document.getElementById('save-receipt').disabled = true;
        document.getElementById('quick-details').disabled = true;
        document.getElementById('palette-subtotal').innerText='Материалы: —';
    }
    function downloadJSON(value, filename) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], {type:'application/json'}));
        const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function exportBackup() {
        try { downloadJSON({app:'master-calc', schemaVersion:3, exportedAt:new Date().toISOString(),
            history:readHistory(), settings:getSettings(), config:getConfig(), deleted:readDeleted()}, 'Master_Calc_Backup.json'); }
        catch(e) { showToast(e.message, true); }
    }
    async function importBackup(input) {
        try {
            const file = input.files[0]; if (!file) return;
            if (file.size > 20 * 1024 * 1024) throw new Error('Файл слишком большой (максимум 20 МБ)');
            const backup = JSON.parse(await file.text());
            if (backup.app !== 'master-calc' || ![2,3].includes(backup.schemaVersion) || !Array.isArray(backup.history) ||
                !backup.history.every(validReceipt) || !backup.settings ||
                !Object.keys(DEFAULT_SETTINGS).every(k => typeof backup.settings[k] === 'number' && Number.isFinite(backup.settings[k]) && backup.settings[k] >= 0))
                throw new Error('Некорректная резервная копия');
            if(backup.schemaVersion===3 && !validConfig(backup.config))throw new Error('Некорректный каталог в копии');
            if(backup.deleted!==undefined && (!Array.isArray(backup.deleted)||!backup.deleted.every(validReceipt)))throw new Error('Некорректные удалённые чеки в копии');
            let existing = [], damaged = false;
            try { existing = readHistory(); } catch(e) { damaged = true; }
            const merged = mergeHistory(existing, backup.history);
            const warning = damaged ? 'Текущая история повреждена. Сохранить её исходную копию и восстановить историю из файла? ' : '';
            if (!confirm(`${warning}Добавить ${merged.length-existing.length} чеков, сохранить ${existing.length} текущих и заменить тарифы${backup.schemaVersion===3?", каталог и шаблоны":""} из копии?`)) return;
            const previous = {[DB_KEY]:localStorage.getItem(DB_KEY), [SETTINGS_KEY]:localStorage.getItem(SETTINGS_KEY),[CONFIG_KEY]:localStorage.getItem(CONFIG_KEY),[TRASH_KEY]:localStorage.getItem(TRASH_KEY)};
            localStorage.setItem('master_calc_palette_before_import', JSON.stringify(previous));
            try {
                localStorage.setItem(DB_KEY, JSON.stringify(merged));
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings));
                if(backup.schemaVersion===3)localStorage.setItem(CONFIG_KEY,JSON.stringify(backup.config));
                if(backup.deleted)localStorage.setItem(TRASH_KEY,JSON.stringify(mergeHistory(readDeleted(),backup.deleted)));
            } catch(e) {
                for (const [key,value] of Object.entries(previous)) {
                    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value);
                }
                throw e;
            }
            invalidateCalculation(); loadSettings(); applyRaw({});refreshCatalog();refreshTemplates(); showToast(`Восстановлено. Чеков: ${merged.length}`);
        } catch(e) { showToast(e.message || 'Не удалось восстановить копию', true); }
        finally { input.value = ''; }
    }

    // Безопасная миграция с исходной копией
    function migrateOldData() {
        const flag = 'master_calc_palette_migrated_v2_safe';
        if (localStorage.getItem(flag)) return;
        const keys = [DB_KEY, SETTINGS_KEY, 'palette_m_history', 'palette_m_v7_history', 'palette_master_history_ultimate',
            'palette_master_db_v11', 'palette_master_db_v12', 'palette_master_db_v13', 'palette_master_set_v13', 'palette_master_set_v12',
            'palette_master_set_v11', 'palette_master_settings_ultimate', 'palette_m_v7_settings'];
        const snapshot = Object.fromEntries(keys.map(k => [k,localStorage.getItem(k)]));
        const existing = readHistory();
        let old = [], skipped = 0;
        for (const key of keys.slice(2,8)) {
            try { const h = JSON.parse(snapshot[key]); if (Array.isArray(h)) { for (const item of h) { if (validReceipt(item)) old.push(item); else skipped++; } } } catch(e) {}
        }
        let settings = getSettings();
        if (!snapshot[SETTINGS_KEY]) for (const key of keys.slice(8)) {
            try { const value = JSON.parse(snapshot[key]); if (value && typeof value === 'object' && !Array.isArray(value)) { settings=normalizeSettings(value); break; } } catch(e) {}
        }
        localStorage.setItem('master_calc_palette_before_migration', JSON.stringify(snapshot));
        localStorage.setItem(DB_KEY, JSON.stringify(mergeHistory(existing, old)));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        localStorage.setItem(flag,'true');
        if (skipped) showToast(`Старых записей неизвестного формата: ${skipped}. Исходные данные сохранены отдельно.`,true);
    }

    // Защита от XSS
    function escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    function showToast(text, isError = false) {
        const t = document.getElementById('toast');
        t.innerText = text;
        if(isError) t.classList.add('error'); else t.classList.remove('error');
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    function openTab(id, btn) {
        const contents = document.getElementsByClassName('tab-content');
        for(let i = 0; i < contents.length; i++) { contents[i].classList.remove('active'); }

        const buttons = document.getElementsByClassName('tab-btn');
        for(let i = 0; i < buttons.length; i++) { buttons[i].classList.remove('active'); }

        document.getElementById(id).classList.add('active');
        if(btn) btn.classList.add('active');

        document.getElementById('mobile-summary').hidden = id !== 'calc';
        document.getElementById('mobile-summary').style.display = id !== 'calc' ? 'none' : '';
        if (id === 'history') renderHistory();
        if (id === 'settings') {loadSettings();refreshCatalog();refreshTemplates();}
        if (id === 'calc') calculate(false,true);
        window.scrollTo(0, 0);
    }

    async function getContact() {
        if (!('contacts' in navigator)) return showToast("Нет доступа к контактам", true);
        try {
            const c = await navigator.contacts.select(['name'], { multiple: false });
            if (c.length > 0) { document.getElementById('calc-client-name').value = c[0].name[0]; scheduleCalculation(); }
        } catch (e) {}
    }

    function getSettings() {
        try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); }
        catch(e) { return {...DEFAULT_SETTINGS}; }
    }

    function loadSettings() {
        const s = getSettings();
        document.getElementById('s-hour').value = s.hour;
        document.getElementById('s-rent-std').value = s.rentStd;
        document.getElementById('s-rent-prem').value = s.rentPrem;
        document.getElementById('s-cons').value = s.cons;
        document.getElementById('s-mark').value = s.mark;
        document.getElementById('p-estel').value = s.pEstel;
        document.getElementById('p-bicolor').value = s.pBicolor;
        document.getElementById('p-nuk').value = s.pNuk;
        document.getElementById('p-nuk-clear').value = s.pNukClear;
        document.getElementById('p-powder').value = s.pPowder;
        document.getElementById('p-oxide').value = s.pOxide;
        document.getElementById('p-booster').value = s.pBooster;
    }

    function saveSettings() {
        try {
            const fields = {hour:'s-hour', rentStd:'s-rent-std', rentPrem:'s-rent-prem', cons:'s-cons', mark:'s-mark',
                pEstel:'p-estel', pBicolor:'p-bicolor', pNuk:'p-nuk', pNukClear:'p-nuk-clear',
                pPowder:'p-powder', pOxide:'p-oxide', pBooster:'p-booster'};
            const settings = Object.fromEntries(Object.entries(fields).map(([k,id])=>[k,readNumber(id)]));
            localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); invalidateCalculation(); showToast('База цен сохранена!');
        } catch(e) { showToast(e.message || 'Ошибка сохранения настроек',true); }
    }

    function calculate(scroll = true, quiet = false) {
        quietCalculation = quiet;
        invalidateCalculation();
        try {
        syncPaymentModes();
        const s = getSettings();
        const clientName = document.getElementById('calc-client-name').value.trim();
        const wTime = readNumber('work-time');


        const rentMode='hourly';
        const workMode=document.getElementById('work-mode').value||'hourly';
        if(!['hourly','fixed'].includes(workMode)||!['hourly','fixed','none'].includes(rentMode))throw new Error('Выберите режим оплаты');
        const workFixed=workMode==='fixed'?readNumber('work-fixed'):0;
        const rentFixed=0;
        const extraBase=readNumber('extra-cost');
        const taxPercent=readNumber('tax-percent'),feePercent=readNumber('fee-percent');
        const coverDeductions=document.getElementById('cover-deductions').checked===true;
        const extraLines=extraExpenses.map(e=>({id:e.id,name:e.name,amount:readNumber('extra-value-'+e.id)}));
        const extraName=document.getElementById('extra-name').value.trim();
        const rTime = rentMode==='hourly'?readNumber('rent-time'):0;
        const cCount = readNumber('cons-count', true);
        const rType = document.getElementById('rent-type').value;
        if (!['std','prem'].includes(rType)) throw new Error('Выберите тариф аренды');

        const gE = readNumber('m-estel',false,true);
        const gB = readNumber('m-bicolor',false,true);
        const gN = readNumber('m-nuk',false,true);
        const gNC = readNumber('m-nuk-clear',false,true);
        const gP = readNumber('m-powder',false,true);
        const gO = readNumber('m-oxide',false,true);
        const gBoost = readNumber('m-booster',false,true);

        const workAmount = workMode==='fixed'?workFixed:wTime*s.hour;
        const rentAmount = rentMode==='none'?0:rentMode==='fixed'?rentFixed:rTime*(rType==='std'?s.rentStd:s.rentPrem);
        const consumablesAmount = cCount * s.cons;

        const config=getConfig(), materialLines=[];
        const legacyQuantities={gE,gB,gN,gNC,gP,gO,gBoost};
        for(const item of config.catalog) {
            const builtin=BUILTIN_MATERIALS.find(([id])=>id===item.id);
            const qty=builtin?legacyQuantities[builtin[3]]:(Object.hasOwn(customQuantities,item.id)?readNumber('quantity-'+item.id,item.unit==='шт',true):0);
            if(item.unit==='шт' && !Number.isInteger(qty))throw new Error('Количество штучного материала должно быть целым');
            if(qty>0)materialLines.push({id:item.id,name:item.name,unit:item.unit,quantity:qty,unitPrice:materialPrice(item,s),cost:MasterCalcCore.cents(qty*materialPrice(item,s))/100});
        }
        const quote=MasterCalcCore.calculateQuote({work:workAmount,rent:rentAmount,consumables:consumablesAmount,
            materials:materialLines.map(i=>i.cost),extras:[extraBase,...extraLines.map(e=>e.amount)],
            markupRate:s.mark,taxRate:taxPercent/100,feeRate:feePercent/100,coverDeductions});
        const {salary,rent,consumables,matCost,markup,extraCost,taxCost,feeCost,total,exp,profit}=quote;
        const recipeArr=materialLines.map(i=>`${i.name}:${i.quantity}${i.unit}`);

        if (!Number.isFinite(total) || total <= 0) throw new Error('Сумма чека должна быть больше 0 ₽');

        updatePaletteCosts(materialLines);
        document.getElementById('res-extra').innerText=moneyText(extraCost);
        document.getElementById('res-deductions').innerText=moneyText(taxCost+feeCost);
        document.getElementById('res-salary').innerText = moneyText(salary);
        document.getElementById('res-rent').innerText = moneyText(rent);
        document.getElementById('res-consum').innerText = moneyText(consumables);
        document.getElementById('res-materials').innerText = moneyText(matCost);
        document.getElementById('res-expenses').innerText = moneyText(exp);
        document.getElementById('res-markup').innerText = moneyText(markup);
        document.getElementById('res-total').innerText = moneyText(total);
        document.getElementById('res-profit').innerText = 'Доход после расходов: ' + moneyText(profit);

        document.getElementById('res-box').style.display = 'block';
        if (scroll) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

        currentCalc = {
            id: Date.now(), date: new Date().toLocaleDateString('ru-RU'),
            schemaVersion:3, dateKey:dateKey(), createdAt:new Date().toISOString(), timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
            rates:{...s}, materialLines, breakdown:{salary, rent, consumables, matCost, markup, extraCost,taxCost,feeCost}, moneyCents:quote.cents, cloudStatus:'not-confirmed',
            name: clientName || 'Без имени',
            recipe: recipeArr.length > 0 ? recipeArr.join(', ') : 'Без мат-в',
            total, profit, exp, workTime: wTime,
            raw: { wTime, rTime, cCount, rType, gE, gB, gN, gNC, gP, gO, gBoost, workMode,rentMode,workFixed,rentFixed,extraCost:extraBase,extraName,taxPercent,feePercent,coverDeductions,extraExpenses:extraLines,customQuantities:Object.fromEntries(Object.keys(customQuantities).map(id=>[id,readNumber('quantity-'+id,false,true)])) }
        };
        document.getElementById('quick-total').innerText = moneyText(total);
        document.getElementById('calc-message').innerText = '';
        document.getElementById('save-receipt').disabled = false;
        document.getElementById('quick-details').disabled = false;
        return true;
        } catch(e) {
            invalidateCalculation();
            document.getElementById('calc-message').innerText = e.message || 'Проверьте поля';
            if (!quiet) showToast(e.message || 'Ошибка расчёта',true);
            return false;
        } finally { quietCalculation = false; }
    }

    function submitToGoogle(receipt) {
        const iframeName = 'master_form_' + receipt.id;
        const frame = document.createElement('iframe');frame.hidden=true;frame.name=iframeName;
        const form=document.createElement('form');form.hidden=true;form.method='POST';form.action=FORM_URL;form.target=iframeName;
        const values={
            'entry.1004283552':receipt.date,'entry.366487715':`[${receipt.name}] ${receipt.recipe}`,
            'entry.180743673':receipt.workTime,'entry.1564921093':receipt.total.toFixed(2),
            'entry.233391810':receipt.profit.toFixed(2),'entry.1441756294':receipt.exp.toFixed(2)
        };
        for(const [name,value] of Object.entries(values)){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);}
        try {document.body.appendChild(frame);document.body.appendChild(form);form.submit();}
        finally {setTimeout(()=>{form.remove();frame.remove();},30000);}
    }
    function saveData() {
        if (saving || !currentCalc) return;
        clearTimeout(calcTimer);
        if (!calculate(false)) return;
        saving=true;
        let localSaved=false;
        try {
            const history=readHistory();
            currentCalc.id=history.reduce((next,i)=>Math.max(next,i.id+1),Date.now());
            currentCalc.cloudStatus='local-only';
            const receipt=JSON.parse(JSON.stringify(currentCalc));
            localStorage.setItem(DB_KEY,JSON.stringify([receipt,...history]));
            localSaved=true;
            let message='Чек сохранён в этом браузере. Без сети отправка в Google Forms не выполнялась.';
            if(navigator.onLine!==false){
                try {
                    submitToGoogle(receipt);
                    receipt.cloudStatus='attempted-unconfirmed';
                    localStorage.setItem(DB_KEY,JSON.stringify([receipt,...history]));
                    message='Чек сохранён в этом браузере. Google Forms: отправка инициирована, приём не подтверждён.';
                } catch(error) { message='Чек сохранён в этом браузере. Отправку в Google Forms подтвердить не удалось.'; }
            }
            document.getElementById('save-status').innerText=message;
            document.getElementById('calc-client-name').value='';
            applyRaw({});invalidateCalculation();
            showToast(message);
        } catch(error) {
            if(localSaved){invalidateCalculation();showToast('Чек сохранён. Не удалось очистить форму для новой услуги',true);}
            else showToast('Не удалось сохранить чек. Данные оставлены в форме. '+error.message,true);
        } finally {saving=false;}
    }
    function connectionStatus(){document.getElementById('network-status').innerText=navigator.onLine===false?'Без сети · локальные расчёты доступны':'Подключение есть';}
    let updateRegistration=null;
    async function initOffline(){
        connectionStatus();window.addEventListener('online',connectionStatus);window.addEventListener('offline',connectionStatus);
        const status=document.getElementById('offline-status');
        if(window.MASTER_CALC_STANDALONE){status.innerText='Однофайловая версия · хранение в этом браузере';return;}
        if(!('serviceWorker' in navigator)){status.innerText='Офлайн-установка недоступна в этом браузере';return;}
        try {
            const registration=await navigator.serviceWorker.register('./sw.js');
            updateRegistration=registration;
            const waiting=()=>{if(registration.waiting && navigator.serviceWorker.controller)document.getElementById('update-app').hidden=false;};waiting();
            registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed'){waiting();if(!navigator.serviceWorker.controller)status.innerText='Файлы загружены для офлайн';}});});
            await navigator.serviceWorker.ready;status.innerText='Файлы загружены для офлайн';
        }catch(error){status.innerText='Офлайн не подготовлен. Проверьте HTTPS или запуск через localhost';}
    }
    function activateUpdate(){
        if(!updateRegistration?.waiting)return;
        if(!confirm('Обновить приложение? Сохранённая история останется. Незавершённый расчёт будет сброшен.'))return;
        navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});
        updateRegistration.waiting.postMessage({type:'SKIP_WAITING'});
    }

    function renderHistory(more = false) {
        historyLimit = more ? historyLimit + 50 : 50;
        const all=readHistory(), from=document.getElementById('history-from').value,to=document.getElementById('history-to').value;
        if(from && to && from>to) {document.getElementById('period-stats').innerText='Начало периода должно быть раньше конца';document.getElementById('history-list').innerHTML='';document.getElementById('history-count').innerText='';document.getElementById('history-more').hidden=true;document.getElementById('stat-total').innerText='—';return;}
        const h=all.filter(i=>{const day=receiptDate(i);return (!from&&!to)||day&&(!from||day>=from)&&(!to||day<=to);});
        const sums=h.reduce((s,i)=>({total:s.total+i.total,exp:s.exp+i.exp,profit:s.profit+i.profit}),{total:0,exp:0,profit:0});
        document.getElementById('period-stats').innerText=`Чеков: ${h.length} · Выручка: ${moneyText(sums.total)} · Прямые расходы: ${moneyText(sums.exp)} · Доход: ${moneyText(sums.profit)} · Средний чек: ${moneyText(h.length?sums.total/h.length:0)}${(from||to)&&all.some(i=>!receiptDate(i))?' · Записи без распознанной даты исключены':''}`;
        const searchQuery = document.getElementById('search-history').value.trim().toLowerCase();

        const totalProfitAllTime = h.reduce((s, i) => s + i.profit, 0);
        document.getElementById('stat-total').innerText = moneyText(totalProfitAllTime);

        const filtered = h.filter(i => (i.name||'').toLowerCase().includes(searchQuery) || (i.recipe||'').toLowerCase().includes(searchQuery));

        const filteredLabel = document.getElementById('stat-filtered');
        if(searchQuery.length > 0) {
            filteredLabel.style.display = 'block';
            filteredLabel.innerText = 'По найденному: ' + moneyText(filtered.reduce((s, i) => s + i.profit, 0));
        } else {
            filteredLabel.style.display = 'none';
        }

        document.getElementById('history-list').innerHTML = filtered.slice(0,historyLimit).map(i => `
            <div class="history-item">
                ${i.raw ? `<button class="btn-repeat" onclick="loadReceipt(${i.id})" title="Повторить расчет" aria-label="Повторить расчёт">↻</button>` : ''}
                <button class="btn-del" onclick="deleteItem(${i.id})" title="Удалить" aria-label="Удалить чек">✖</button>
                <div style="font-size:12px; color:var(--text-muted); margin-bottom: 4px;">${escapeHTML(i.date)}</div>
                <div style="font-weight:700; color:var(--text-main); font-size: 16px;">${escapeHTML(i.name)}</div>
                <div style="font-size:13px; color:var(--text-muted); margin: 6px 0;"><b>Материалы:</b> ${escapeHTML(i.recipe)}</div>
                <div class="hint">${i.cloudStatus==='attempted-unconfirmed'?'Сохранён здесь · Google Forms: приём не подтверждён':'Сохранён здесь'}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px;">
                    <span style="color:var(--success); font-weight: 700;">${moneyText(i.profit)}</span>
                    <span style="color:var(--text-muted); font-size: 14px;">Чек: ${moneyText(i.total)}</span>
                </div>
            </div>`).join('') || '<p class="hint">Чеков не найдено</p>';
        document.getElementById('history-count').innerText = `Показано ${Math.min(historyLimit,filtered.length)} из ${filtered.length}`;
        document.getElementById('history-more').hidden = historyLimit >= filtered.length;
    }

    function loadReceipt(id) {
        const h = readHistory();
        const item = h.find(i => i.id === id);
        if (!item || !item.raw) return showToast("Не удалось загрузить данные", true);

        openTab('calc', document.querySelector('.tab-btn'));

        document.getElementById('calc-client-name').value = item.name;
        try {applyRaw(item.raw);syncMaterials();if(calculate(false))showToast('Новый расчёт по текущим тарифам');}
        catch(error){invalidateCalculation();showToast(error.message,true);}
    }

    function readDeleted(){const deleted=JSON.parse(localStorage.getItem(TRASH_KEY)||'[]');if(!Array.isArray(deleted)||!deleted.every(validReceipt))throw new Error('Повреждена корзина удалённых чеков');return deleted;}
    function deleteItem(id) {
        if(!confirm('Удалить чек из истории? Его можно восстановить. Из Google Forms запись не удаляется.'))return;
        try {
            const history=readHistory(),item=history.find(i=>i.id===id);if(!item)return;
            localStorage.setItem(TRASH_KEY,JSON.stringify(mergeHistory(readDeleted(),[item])));
            localStorage.setItem(DB_KEY,JSON.stringify(history.filter(i=>i.id!==id)));
            renderHistory();showToast('Чек перенесён в удалённые');
        }catch(error){showToast('Удаление не выполнено: '+error.message,true);}
    }
    function restoreDeleted(){try{
        const deleted=readDeleted();if(!deleted.length){showToast('Удалённых чеков нет');return;}
        localStorage.setItem(DB_KEY,JSON.stringify(mergeHistory(readHistory(),deleted)));
        localStorage.removeItem(TRASH_KEY);renderHistory();showToast('Удалённые чеки восстановлены');
    }catch(error){showToast('Не удалось восстановить: '+error.message,true);}}
    function selectedHistory(){
        const from=document.getElementById('history-from').value,to=document.getElementById('history-to').value;
        if(from&&to&&from>to)throw new Error('Начало периода должно быть раньше конца');
        const search=document.getElementById('search-history').value.trim().toLowerCase();
        return readHistory().filter(i=>{const day=receiptDate(i);return ((!from&&!to)||(day&&(!from||day>=from)&&(!to||day<=to)))&&((i.name||'').toLowerCase().includes(search)||(i.recipe||'').toLowerCase().includes(search));});
    }

    function csvText(value){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return text.replace(/"/g,'""');}
    function exportExcel() {
        let h;try{h=selectedHistory();}catch(error){showToast(error.message,true);return;}
        if(h.length === 0) return showToast("История пуста", true);
        let csv = "\uFEFFДата;Клиент;Рецепт;Часы;Выручка;Доход после расходов;Прямые расходы\n";
        h.forEach(i => {
            const safeName = csvText(i.name);
            const safeRecipe = csvText(i.recipe);
            csv += `"${csvText(i.date)}";"${safeName}";"${safeRecipe}";${i.workTime};${i.total.toFixed(2).replace('.',',')};${i.profit.toFixed(2).replace('.',',')};${i.exp.toFixed(2).replace('.',',')}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Master_History.csv";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    window.onload = function() {
        try { migrateOldData(); } catch(e) { showToast('История не изменена: ' + e.message,true); }
        loadSettings();
        document.querySelectorAll('#calc input, #calc select').forEach(field => {
            if (['material-picker','service-template','template-name'].includes(field.id)) return;
            field.addEventListener(field.tagName==='SELECT'?'change':'input',scheduleCalculation);
        });

        document.getElementById('calc').addEventListener('keydown',paletteKeyboard);
        try {refreshCatalog();refreshTemplates();}catch(e){showToast(e.message,true);}
        calculate(false,true);
        initOffline();
    };
