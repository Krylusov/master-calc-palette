window.onerror = function(msg, url, line) {
        showToast("Ошибка кода: строка " + line, true);
        return false;
    };

    const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSe0tKKL8nq1xvlN5UNBvr34XtQSNb2md-d8fmDOtGPVIyinAw/formResponse";

    // ВЕЧНЫЕ КЛЮЧИ ХРАНЕНИЯ
    const DB_KEY = "master_calc_palette_history_final";
    const SETTINGS_KEY = "master_calc_palette_settings_final";
    const TRASH_KEY = 'master_calc_palette_deleted_v2';
    const BACKUP_STATE_KEY = 'master_calc_palette_backup_state_v1';
    let viewedReceiptId = null;
    let currentCalc = null;
    let editSession = null;

    const DEFAULT_SETTINGS = Object.freeze({hour:3500, rentStd:320, rentPrem:420, cons:300, mark:0.5,
        pEstel:7.75, pBicolor:11.71, pNuk:19.6, pNukClear:7, pPowder:5, pOxide:1, pBooster:30.4});
    const CONFIG_KEY = 'master_calc_palette_config_v3';
    const BUILTIN_MATERIALS = [
        ['estel','Estel','pEstel','gE'],['bicolor','Bicolor','pBicolor','gB'],['nuk','NUK','pNuk','gN'],
        ['nuk-clear','NUK прозрачный','pNukClear','gNC'],['powder','Пудра','pPowder','gP'],
        ['oxide','Оксид','pOxide','gO'],['booster','Бустер','pBooster','gBoost']
    ];
    let customQuantities = {}, extraExpenses = [];
    const selectedMaterials = new Set();
    function moneyText(value) {return value.toFixed(2).replace(/\.00$/,'').replace('.',',')+' ₽';}
    function renderExtras() {
        document.getElementById('extras-list').innerHTML=extraExpenses.map(e=>`<div class="card"><label for="extra-label-${e.id}">Название расхода</label><input class="search-bar" id="extra-label-${e.id}" value="${escapeHTML(e.name)}" oninput="extraExpenses.find(e=>e.id===${e.id}).name=this.value;scheduleCalculation()"><div class="input-row"><label for="extra-value-${e.id}">Сумма, ₽</label><input id="extra-value-${e.id}" type="number" class="input-control" min="0" step="0.01" value="${escapeHTML(e.amount)}" oninput="extraExpenses.find(e=>e.id===${e.id}).amount=this.value;scheduleCalculation()"><button class="material-remove" onclick="removeExtraExpense(${e.id})" aria-label="Убрать дополнительный расход">×</button></div></div>`).join('');
    }
    function addExtraExpense(){extraExpenses.push({id:extraExpenses.reduce((next,e)=>Math.max(next,e.id+1),Date.now()),name:'',amount:'0'});renderExtras();persistDraft();}
    function removeExtraExpense(id){extraExpenses=extraExpenses.filter(e=>e.id!==id);draftInvalidFields.delete('extra-value-'+id);renderExtras();calculate(false,true);persistDraft();}

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
            c.templates.every(t=>t && Number.isSafeInteger(t.id) && typeof t.name==='string' && validRaw(t.raw)) &&
            (c.googleSend===undefined || typeof c.googleSend==='boolean') &&
            (c.palette===undefined || (c.palette && ['order','favorites'].every(key=>Array.isArray(c.palette[key]) && new Set(c.palette[key]).size===c.palette[key].length && c.palette[key].every(id=>c.catalog.some(i=>i.id===id)))));
    }
    function palettePreferences(config=getConfig()) {
        const ids=config.catalog.map(i=>i.id);
        return {order:[...(config.palette?.order||[]),...ids.filter(id=>!config.palette?.order.includes(id))],
            favorites:config.palette?.favorites||MATERIAL_KEYS.filter(id=>ids.includes(id))};
    }
    function togglePaletteFavorite(id) {
        try {const config=getConfig(),prefs=palettePreferences(config);if(!prefs.order.includes(id))return;
            prefs.favorites=prefs.favorites.includes(id)?prefs.favorites.filter(key=>key!==id):[...prefs.favorites,id];
            config.palette=prefs;persistConfig(config);calculate(false,true);
        } catch(e){showToast(e.message,true);}
    }
    function movePaletteMaterial(id,direction) {
        try {const config=getConfig(),prefs=palettePreferences(config),index=prefs.order.indexOf(id),next=index+direction;
            if(![-1,1].includes(direction)||index<0||next<0||next>=prefs.order.length)return;
            [prefs.order[index],prefs.order[next]]=[prefs.order[next],prefs.order[index]];config.palette=prefs;persistConfig(config);calculate(false,true);
        } catch(e){showToast(e.message,true);}
    }
    function calculationConfig() {
        const config=getConfig();
        return editSession?{...config,catalog:historicalCatalog(editSession.original)}:config;
    }
    function materialPrice(item,settings=getSettings()) { return item.rateKey ? settings[item.rateKey] : item.price/item.pack; }
    function persistConfig(config) {
        if (!validConfig(config)) throw new Error('Некорректный каталог');
        localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
        refreshCatalog(); refreshTemplates(); invalidateCalculation();
    }
    function refreshCatalog() {
        const config=getConfig();

        const prefs=palettePreferences(config);
        document.getElementById('catalog-list').innerHTML=prefs.order.map(id=>config.catalog.find(i=>i.id===id)).map((i,index)=>`<div class="card"><b>${escapeHTML(i.name)}</b><p class="hint">${materialPrice(i).toFixed(2)} ₽/${escapeHTML(i.unit)}${i.archived?' · Архив':''}</p><div class="palette-settings-controls"><button type="button" aria-pressed="${prefs.favorites.includes(i.id)}" onclick="togglePaletteFavorite('${i.id}')" aria-label="В избранное: ${escapeHTML(i.name)}">${prefs.favorites.includes(i.id)?'★ В избранном':'☆ В избранное'}</button><button type="button" onclick="movePaletteMaterial('${i.id}',-1)" aria-label="Выше: ${escapeHTML(i.name)}" ${index===0?'disabled':''}>↑</button><button type="button" onclick="movePaletteMaterial('${i.id}',1)" aria-label="Ниже: ${escapeHTML(i.name)}" ${index===prefs.order.length-1?'disabled':''}>↓</button></div><button class="btn" onclick="editCatalogItem('${i.id}')">Изменить</button><button class="btn" onclick="archiveCatalogItem('${i.id}')">${i.archived?'Вернуть':'В архив'}</button></div>`).join('');
        renderCustomMaterials();syncMaterials();
        for (const [id] of BUILTIN_MATERIALS) {
            const item=calculationConfig().catalog.find(i=>i.id===id);
            if (item) {document.querySelector(`label[for="m-${id}"]`).innerText=`${item.name}, ${item.unit}`;document.getElementById('m-'+id).setAttribute('aria-label',`${item.name}, ${item.unit}`);document.getElementById('m-'+id).step=item.unit==='шт'?'1':'0.1';}
        }
    }
    function renderCustomMaterials() {
        const config=calculationConfig(),prefs=palettePreferences(config);
        document.getElementById('custom-materials').innerHTML=config.catalog.filter(i=>!MATERIAL_KEYS.includes(i.id) && (Object.hasOwn(customQuantities,i.id)||(!i.archived&&prefs.favorites.includes(i.id)))).map(i=>`<div class="palette-tile" style="order:${prefs.order.indexOf(i.id)}"><label for="quantity-${i.id}">${escapeHTML(i.name)}, ${escapeHTML(i.unit)}</label><input id="quantity-${i.id}" class="input-control" type="number" min="0" step="${i.unit==='шт'?'1':'0.1'}" inputmode="decimal" placeholder="0" value="${escapeHTML(customQuantities[i.id]??'')}" oninput="customQuantities['${i.id}']=this.value; scheduleCalculation()"><span class="palette-cost" id="cost-${i.id}">0 ₽</span><button class="palette-custom-remove" onclick="removeMaterial('${i.id}')" aria-label="Убрать ${escapeHTML(i.name)}">×</button></div>`).join('');
    }
    function openMaterialCatalog(){document.getElementById('material-search').value='';renderMaterialChoices();document.getElementById('material-dialog').showModal();document.getElementById('material-search').focus();}
    function renderMaterialChoices(){const query=document.getElementById('material-search').value.trim().toLowerCase();const items=calculationConfig().catalog.filter(i=>!i.archived&&i.name.toLowerCase().includes(query));document.getElementById('material-choices').innerHTML=items.map(i=>`<button class="material-choice" onclick="chooseMaterial('${i.id}')"><b>${escapeHTML(i.name)}</b><span>${materialPrice(i).toFixed(2)} ₽/${escapeHTML(i.unit)}</span></button>`).join('')||'<p class="hint">Материалов не найдено</p>';}
    function chooseMaterial(key){if(!calculationConfig().catalog.some(i=>i.id===key&&!i.archived))return;document.getElementById('material-dialog').close();if(MATERIAL_KEYS.includes(key)){selectedMaterials.add(key);syncMaterials();}if(!MATERIAL_KEYS.includes(key)){if(!Object.hasOwn(customQuantities,key))customQuantities[key]='';renderCustomMaterials();calculate(false,true);}const field=document.getElementById(MATERIAL_KEYS.includes(key)?'m-'+key:'quantity-'+key);field.focus();field.select();persistDraft();}
    function clearMaterials(){selectedMaterials.clear();for(const key of MATERIAL_KEYS){document.getElementById('m-'+key).value='';draftInvalidFields.delete('m-'+key);}for(const key of Object.keys(customQuantities))draftInvalidFields.delete('quantity-'+key);customQuantities={};renderCustomMaterials();syncMaterials();calculate(false,true);persistDraft();}
    function updatePaletteCosts(lines){const costs=new Map(lines.map(i=>[i.id,i.cost]));for(const i of calculationConfig().catalog){const field=document.getElementById('cost-'+i.id);if(field)field.innerText=moneyText(costs.get(i.id)||0);}document.getElementById('palette-subtotal').innerText='Материалы: '+moneyText(lines.reduce((sum,i)=>sum+i.cost,0));}
    function paletteKeyboard(event) {
        if(!['Enter','Tab'].includes(event.key))return;
        const selector='#materials-palette input, #custom-materials input';
        const inputs=[...document.querySelectorAll(selector)].filter(i=>!i.closest('[hidden]')).sort((a,b)=>Number(a.closest('.palette-tile').style.order)-Number(b.closest('.palette-tile').style.order));
        const index=inputs.indexOf(event.target),direction=event.shiftKey?-1:1;
        if(event.key==='Enter'){
            if(index<0)return;event.preventDefault();const next=inputs[index+1];if(next){next.focus();next.select();}return;
        }
        // CSS grid order preserves input nodes. Match that order for keyboard entry,
        // including both boundaries, without positive tabindex or a focus trap.
        const controls=[...document.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')].filter(i=>!i.disabled&&i.tabIndex>=0&&i.getClientRects().length);
        const paletteControls=controls.filter(i=>i.closest('#materials-palette')&&i.closest('.palette-tile')).sort((a,b)=>Number(a.closest('.palette-tile').style.order)-Number(b.closest('.palette-tile').style.order));
        const tabIndex=paletteControls.indexOf(event.target);
        let next;
        if(tabIndex>=0){
            next=paletteControls[tabIndex+direction];
            if(!next){const positions=paletteControls.map(i=>controls.indexOf(i)),boundary=direction>0?Math.max(...positions):Math.min(...positions);next=controls[boundary+direction];}
        }else if(paletteControls.includes(controls[controls.indexOf(event.target)+direction]))next=direction>0?paletteControls[0]:paletteControls[paletteControls.length-1];
        if(next){event.preventDefault();next.focus();if(next.matches(selector))next.select();}
    }
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
    function saveTemplate() { try{if(!calculate(false))return;const name=document.getElementById('template-name').value.trim();if(!name)throw new Error('Введите название шаблона');const selectedTemplate=document.getElementById('service-template').value;const c=getConfig();c.templates.push({id:c.templates.reduce((next,t)=>Math.max(next,t.id+1),Date.now()),name,raw:recipeRaw(currentCalc.raw)});persistConfig(c);document.getElementById('service-template').value=selectedTemplate;calculate(false,true);persistDraft();showToast('Шаблон сохранён');}catch(e){showToast(e.message,true);} }
    function deleteTemplate() {try{const id=Number(document.getElementById('service-template').value);if(!id)return;const c=getConfig();c.templates=c.templates.filter(t=>t.id!==id);persistConfig(c);showToast('Шаблон удалён');}catch(e){showToast(e.message,true);} }
    function applyTemplate() {try{if(editSession)throw new Error('Сначала сохраните или отмените редактирование чека.');const t=getConfig().templates.find(t=>t.id===Number(document.getElementById('service-template').value));if(!t||!protectCurrentCalculation({ignoreTemplateSelection:true}))return;editSession=null;updateEditUI();applyRaw(recipeRaw(t.raw));calculate(false);persistDraft();showToast('Шаблон применён по текущим тарифам');}catch(e){showToast(e.message,true);} }
    function recipeRaw(raw) {const copy=JSON.parse(JSON.stringify(raw));delete copy.actualPrice;return copy;}
    function resetActualPrice() {document.getElementById('actual-price-enabled').checked=false;document.getElementById('actual-price').value='';syncActualPrice();calculate(false,true);persistDraft();}
    function syncActualPrice() {document.getElementById('actual-price-controls').hidden=!document.getElementById('actual-price-enabled').checked;}
    function applyRaw(raw) {
        invalidateCalculation();
        if(!validRaw(raw))throw new Error('Некорректные входные данные чека или шаблона');
        const ids=new Set(calculationConfig().catalog.map(i=>i.id));
        for(const [id,qty] of Object.entries(raw.customQuantities||{}))if(Number(qty)>0&&!ids.has(id))throw new Error('Материал из шаблона или чека отсутствует в каталоге. Восстановите каталог из резервной копии');
        for(const [id,,,key] of BUILTIN_MATERIALS)if(Number(raw[key])>0&&!ids.has(id))throw new Error('Материал из шаблона или чека отсутствует в каталоге');
        draftInvalidFields.clear();
        document.getElementById('actual-price-enabled').checked=raw.actualPrice!==undefined;document.getElementById('actual-price').value=raw.actualPrice??'';syncActualPrice();
        const fields={wTime:'work-time',rTime:'rent-time',cCount:'cons-count',rType:'rent-type',workMode:'work-mode',workFixed:'work-fixed',extraCost:'extra-cost',extraName:'extra-name',taxPercent:'tax-percent',feePercent:'fee-percent'};
        const defaults={wTime:1,rTime:1,cCount:1,rType:'std',workMode:'hourly',rentMode:'hourly',workFixed:3500,rentFixed:320,extraCost:0,extraName:'',taxPercent:0,feePercent:0};
        for(const [key,id] of Object.entries(fields))document.getElementById(id).value=raw[key]??defaults[key];
        for(const [id,,,key] of BUILTIN_MATERIALS)document.getElementById('m-'+id).value=raw[key]||'';
        selectedMaterials.clear();document.getElementById('duration-display').value=raw.durationMode||'decimal';document.getElementById('rent-link').checked=raw.rentLinked===true;syncDurationPresentation();
        customQuantities=Object.fromEntries(Object.entries(raw.customQuantities||{}).filter(([id])=>ids.has(id)));extraExpenses=(raw.extraExpenses||[]).map(e=>({...e}));document.getElementById('cover-deductions').checked=raw.coverDeductions===true;renderExtras();renderCustomMaterials();syncMaterials();
    }
    function replaceDurationPart(id,value,invalid=false) {
        const field=document.getElementById(id);field.value=value;
        if(invalid)draftInvalidFields.add(id);else draftInvalidFields.delete(id);
        field.setAttribute('aria-invalid',String(invalid));field.style.borderColor=invalid?'var(--danger)':'';
    }
    // Canonical decimal-hour inputs keep their historic IDs and exact values.
    function syncDurationPresentation(keepParts=false) {
        const minutesMode=document.getElementById('duration-display').value==='minutes';
        for(const kind of ['work','rent']) {
            const field=document.getElementById(kind+'-time'),value=Number(field.value),minutes=value*60;
            const exact=field.value!==''&&Number.isFinite(value)&&value>=0&&Number.isSafeInteger(minutes)&&minutes/60===value&&!draftInvalidFields.has(kind+'-time');
            const useParts=minutesMode&&(exact||keepParts);
            document.getElementById(kind+'-decimal-row').hidden=useParts;
            document.getElementById(kind+'-duration-parts').hidden=!useParts;
            document.getElementById(kind+'-duration-fallback').hidden=!minutesMode||useParts;
            if(!keepParts&&exact){replaceDurationPart(kind+'-hours',Math.floor(minutes/60));replaceDurationPart(kind+'-minutes',minutes%60);}
        }
    }
    function setDurationMode(mode) {
        document.getElementById('duration-display').value=mode==='minutes'?'minutes':'decimal';
        syncDurationPresentation();scheduleCalculation();persistDraft();
    }
    function updateDurationInput(id) {
        if(id==='duration-display'){syncDurationPresentation();return;}
        if(id.startsWith('rent-')&&['rent-time','rent-hours','rent-minutes'].includes(id))document.getElementById('rent-link').checked=false;
        const kind=id.startsWith('work-')?'work':'rent';
        if(['work-hours','work-minutes','rent-hours','rent-minutes'].includes(id)){
            const hours=document.getElementById(kind+'-hours'),minutes=document.getElementById(kind+'-minutes');
            const valid=[hours,minutes].every(field=>field.value!==''&&!field.validity?.badInput&&Number.isSafeInteger(Number(field.value))&&Number(field.value)>=0)&&Number(minutes.value)<60;
            document.getElementById(kind+'-time').value=valid?String(Number(hours.value)+Number(minutes.value)/60):'';
            draftInvalidFields.delete(kind+'-time');
        }
        if(document.getElementById('rent-link').checked&&(id==='rent-link'||id.startsWith('work-'))){
            document.getElementById('rent-time').value=document.getElementById('work-time').value;
            for(const suffix of ['hours','minutes']){const source=document.getElementById('work-'+suffix);replaceDurationPart('rent-'+suffix,source.value,draftInvalidFields.has(source.id)||source.validity?.badInput);}
            if(draftInvalidFields.has('work-time'))draftInvalidFields.add('rent-time');else draftInvalidFields.delete('rent-time');
        }
        if(id==='work-time'||id==='rent-time'||id==='rent-link')syncDurationPresentation();
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

    // Drafts retain form strings, independently of validated receipt raw values.
    const DRAFT_KEY = 'master_calc_palette_draft_v1';
    const DRAFT_DEFAULT_FIELDS = Object.freeze({
        'calc-client-name':'', 'work-time':'1', 'rent-time':'1', 'cons-count':'1',
        'rent-type':'std', 'work-mode':'hourly', 'work-fixed':'3500',
        'extra-cost':'0', 'extra-name':'', 'tax-percent':'0', 'fee-percent':'0',
        ...Object.fromEntries(MATERIAL_KEYS.map(id=>['m-'+id,'']))
    });
    let draftId = newDraftId(), draftBlocked = false, draftWarning = false;
    const draftInvalidFields = new Set();
    function newDraftId() { return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
    function draftStatus(message, error = false) {
        document.getElementById('draft-banner').hidden=!message;
        document.getElementById('draft-message').innerText=message;
        document.getElementById('draft-banner').classList[error?'add':'remove']('draft-error');
        draftWarning=error;
    }
    function captureDraft() {
        const fields=Object.fromEntries(Object.keys(DRAFT_DEFAULT_FIELDS).map(id=>[id,document.getElementById(id).value]));
        const quantities=Object.fromEntries(Object.keys(customQuantities).map(id=>[id,document.getElementById('quantity-'+id).value]));
        const expenses=extraExpenses.map(e=>({id:e.id,name:document.getElementById('extra-label-'+e.id).value,amount:document.getElementById('extra-value-'+e.id).value}));
        const fieldIds=[...Object.keys(fields),...Object.keys(quantities).map(id=>'quantity-'+id),...expenses.map(e=>'extra-value-'+e.id)];
        return {schemaVersion:1,id:draftId,fields,coverDeductions:document.getElementById('cover-deductions').checked===true,
            actualPrice:{enabled:document.getElementById('actual-price-enabled').checked===true,value:document.getElementById('actual-price').value,invalid:draftInvalidFields.has('actual-price')||document.getElementById('actual-price').validity?.badInput===true},
            ...(editSession?{edit:JSON.parse(JSON.stringify(editSession))}:{}),
            customQuantities:quantities,extraExpenses:expenses,selectedMaterials:[...selectedMaterials],
            duration:{mode:document.getElementById('duration-display').value||'decimal',rentLinked:document.getElementById('rent-link').checked===true,
                parts:Object.fromEntries(['work-hours','work-minutes','rent-hours','rent-minutes'].map(id=>[id,document.getElementById(id).value])),
                invalidParts:['work-hours','work-minutes','rent-hours','rent-minutes'].filter(id=>draftInvalidFields.has(id)||document.getElementById(id).validity?.badInput)},
            invalidFields:fieldIds.filter(id=>draftInvalidFields.has(id)||document.getElementById(id).validity?.badInput),
            context:{extrasOpen:document.getElementById('extras-panel').open,templatesOpen:document.getElementById('templates-panel').open,
                serviceTemplate:document.getElementById('service-template').value,templateName:document.getElementById('template-name').value}};
    }
    function hasDraftContent(draft = captureDraft()) {
        return draft.edit||draft.actualPrice?.enabled||Object.entries(DRAFT_DEFAULT_FIELDS).some(([id,value])=>draft.fields[id]!==value)||draft.coverDeductions||
            Object.keys(draft.customQuantities).length>0||draft.extraExpenses.length>0||draft.invalidFields.length>0||
            draft.context.serviceTemplate!==''||draft.context.templateName!==''||draft.selectedMaterials?.length>0||draft.duration?.mode==='minutes'||draft.duration?.rentLinked;
    }
    function validDraft(draft) {
        const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
        if(!object(draft)||draft.schemaVersion!==1||typeof draft.id!=='string'||! /^[a-z0-9-]+$/.test(draft.id)||
            !object(draft.fields)||Object.keys(draft.fields).length!==Object.keys(DRAFT_DEFAULT_FIELDS).length||
            Object.keys(DRAFT_DEFAULT_FIELDS).some(id=>typeof draft.fields[id]!=='string')||typeof draft.coverDeductions!=='boolean'||
            !object(draft.customQuantities)||Object.entries(draft.customQuantities).some(([id,value])=>! /^[a-z0-9-]+$/.test(id)||MATERIAL_KEYS.includes(id)||typeof value!=='string')||
            !Array.isArray(draft.extraExpenses)||new Set(draft.extraExpenses.map(e=>e?.id)).size!==draft.extraExpenses.length||
            draft.extraExpenses.some(e=>!object(e)||!Number.isSafeInteger(e.id)||e.id<=0||typeof e.name!=='string'||typeof e.amount!=='string')||
            !object(draft.context)||typeof draft.context.extrasOpen!=='boolean'||typeof draft.context.templatesOpen!=='boolean'||
            typeof draft.context.serviceTemplate!=='string'||typeof draft.context.templateName!=='string'||!Array.isArray(draft.invalidFields))return false;
        if(draft.actualPrice!==undefined&&(!object(draft.actualPrice)||typeof draft.actualPrice.enabled!=='boolean'||typeof draft.actualPrice.value!=='string'||typeof draft.actualPrice.invalid!=='boolean'))return false;
        if(draft.edit!==undefined&&(!object(draft.edit)||!validReceipt(draft.edit.original)||!editableReceipt(draft.edit.original)||typeof draft.edit.token!=='string'||draft.edit.token!==JSON.stringify(draft.edit.original)||!object(draft.edit.previousDraft)||draft.edit.previousDraft.edit!==undefined||!validDraft(draft.edit.previousDraft)))return false;
        if(draft.selectedMaterials!==undefined&&(!Array.isArray(draft.selectedMaterials)||draft.selectedMaterials.some(id=>!MATERIAL_KEYS.includes(id))))return false;
        if(draft.duration!==undefined&&(!object(draft.duration)||!['decimal','minutes'].includes(draft.duration.mode)||typeof draft.duration.rentLinked!=='boolean'||!object(draft.duration.parts)||Object.keys(draft.duration.parts).length!==4||['work-hours','work-minutes','rent-hours','rent-minutes'].some(id=>typeof draft.duration.parts[id]!=='string')||!Array.isArray(draft.duration.invalidParts)||draft.duration.invalidParts.some(id=>!['work-hours','work-minutes','rent-hours','rent-minutes'].includes(id))))return false;
        const fieldIds=new Set([...Object.keys(DRAFT_DEFAULT_FIELDS),...Object.keys(draft.customQuantities).map(id=>'quantity-'+id),...draft.extraExpenses.map(e=>'extra-value-'+e.id)]);
        return draft.invalidFields.every(id=>fieldIds.has(id));
    }
    function persistDraft() {
        if(draftBlocked)return false;
        try {
            const draft=captureDraft();
            if(!hasDraftContent(draft))return clearDraft();
            localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
            if(draftWarning)draftStatus('Черновик сохранён в этом браузере. Это не сохранённый чек.');
            return true;
        } catch(error) {
            draftStatus('Не удалось сохранить черновик. Последние изменения могут потеряться после закрытия. '+error.message,true);
            return false;
        }
    }
    function restoreDraft() {
        try {
            const text=localStorage.getItem(DRAFT_KEY);
            if(!text)return false;
            const draft=JSON.parse(text);
            if(!validDraft(draft))throw new Error('Неизвестный формат или повреждённые данные.');
            // The receipt commit also retires its draft if removing localStorage failed.
            if(!draft.edit&&[...readHistory(),...readDeleted()].some(receipt=>receipt.sourceDraftId===draft.id)){clearDraft();return false;}
            if(draft.edit&&readHistory().some(i=>i.id===draft.edit.original.id&&i.lastEditDraftId===draft.id)){restorePreviousDraft(draft.edit.previousDraft);return true;}
            editSession=draft.edit||null;updateEditUI();
            const catalogIds=new Set(calculationConfig().catalog.map(i=>i.id));
            if(Object.keys(draft.customQuantities).some(id=>!catalogIds.has(id))||
                MATERIAL_KEYS.some(id=>!catalogIds.has(id)&&(draft.fields['m-'+id]!==''||draft.invalidFields.includes('m-'+id))))
                throw new Error('Материал черновика отсутствует в каталоге. Восстановите каталог из резервной копии.');
            draftId=draft.id;draftInvalidFields.clear();
            document.getElementById('actual-price-enabled').checked=draft.actualPrice?.enabled===true;document.getElementById('actual-price').value=draft.actualPrice?.value??'';if(draft.actualPrice?.invalid)draftInvalidFields.add('actual-price');syncActualPrice();draft.invalidFields.forEach(id=>draftInvalidFields.add(id));
            for(const [id,value] of Object.entries(draft.fields)){
                const field=document.getElementById(id);field.value=value;
                // Number controls may sanitize strings produced by another browser.
                if(field.value!==value)draftInvalidFields.add(id);
            }
            selectedMaterials.clear();(draft.selectedMaterials||[]).forEach(id=>selectedMaterials.add(id));
            document.getElementById('duration-display').value=draft.duration?.mode||'decimal';document.getElementById('rent-link').checked=draft.duration?.rentLinked===true;
            syncDurationPresentation();
            if(draft.duration){for(const [id,value] of Object.entries(draft.duration.parts))document.getElementById(id).value=value;draft.duration.invalidParts.forEach(id=>draftInvalidFields.add(id));
                for(const kind of ['work','rent'])if(draft.duration.mode==='minutes'&&draft.fields[kind+'-time']===''){document.getElementById(kind+'-decimal-row').hidden=true;document.getElementById(kind+'-duration-parts').hidden=false;}}
            customQuantities={...draft.customQuantities};extraExpenses=draft.extraExpenses.map(e=>({...e}));
            renderCustomMaterials();renderExtras();
            for(const [id,value] of Object.entries(customQuantities))if(document.getElementById('quantity-'+id).value!==value)draftInvalidFields.add('quantity-'+id);
            for(const expense of extraExpenses)if(document.getElementById('extra-value-'+expense.id).value!==expense.amount)draftInvalidFields.add('extra-value-'+expense.id);
            document.getElementById('cover-deductions').checked=draft.coverDeductions;
            document.getElementById('extras-panel').open=draft.context.extrasOpen;
            document.getElementById('templates-panel').open=draft.context.templatesOpen;
            document.getElementById('service-template').value=draft.context.serviceTemplate;
            document.getElementById('template-name').value=draft.context.templateName;
            refreshCatalog();
            for(const id of draftInvalidFields)document.getElementById(id).setAttribute('aria-invalid','true');
            syncMaterials();syncPaymentModes();draftBlocked=false;
            draftStatus('Восстановлен черновик. Это не сохранённый чек. Проверьте данные перед сохранением.');
            return true;
        } catch(error) {
            draftBlocked=true;
            draftStatus('Черновик не восстановлен. Исходные данные оставлены без изменений. '+error.message+' Для сброса нажмите «Новый расчёт».',true);
            return false;
        }
    }
    function clearDraft() {
        try {localStorage.removeItem(DRAFT_KEY);draftBlocked=false;draftStatus('');return true;}
        catch(error) {draftStatus('Не удалось удалить черновик. Исходные данные сохранены. '+error.message,true);return false;}
    }
    function protectCurrentCalculation({ignoreTemplateSelection=false}={}) {
        const draft=captureDraft();if(ignoreTemplateSelection)draft.context.serviceTemplate='';
        return !(draftBlocked||hasDraftContent(draft))||confirm('Заменить текущий несохранённый расчёт? Его данные будут потеряны.');
    }
    function resetCalculationForm() {
        clearTimeout(calcTimer);editSession=null;updateEditUI();draftInvalidFields.clear();draftId=newDraftId();
        document.getElementById('actual-price-enabled').checked=false;document.getElementById('actual-price').value='';syncActualPrice();
        for(const [id,value] of Object.entries(DRAFT_DEFAULT_FIELDS)){
            const field=document.getElementById(id);field.value=value;field.setAttribute('aria-invalid','false');field.style.borderColor='';
        }
        selectedMaterials.clear();document.getElementById('duration-display').value='decimal';document.getElementById('rent-link').checked=false;syncDurationPresentation();
        customQuantities={};extraExpenses=[];renderCustomMaterials();renderExtras();renderClientSuggestions();
        document.getElementById('cover-deductions').checked=false;
        for(const id of ['extras-panel','templates-panel'])document.getElementById(id).open=false;
        for(const id of ['service-template','template-name'])document.getElementById(id).value='';
        document.getElementById('calc-message').innerText='';syncMaterials();syncPaymentModes();invalidateCalculation();
    }
    function startNewCalculation() {
        if(editSession){showToast('Сначала сохраните или отмените редактирование чека.',true);return false;}
        if(!protectCurrentCalculation()||!clearDraft())return false;
        resetCalculationForm();refreshCatalog();calculate(false,true);return true;
    }
    function handleCalculationInput(event) {
        if(event.type==='change'&&event.target.tagName!=='SELECT'&&event.target.type!=='checkbox')return;
        const id=event.target.id;
        if(!Object.hasOwn(DRAFT_DEFAULT_FIELDS,id)&&!['duration-display','rent-link','work-hours','work-minutes','rent-hours','rent-minutes'].includes(id)&&!['cover-deductions','actual-price','actual-price-enabled'].includes(id)&&!id.startsWith('quantity-')&&!id.startsWith('extra-label-')&&!id.startsWith('extra-value-')){
            if(id==='template-name'||id==='service-template')persistDraft();
            return;
        }
        if(event.target.validity?.badInput)draftInvalidFields.add(id);else draftInvalidFields.delete(id);
        if(id==='calc-client-name'&&event.type==='input')renderClientSuggestions();
        syncActualPrice();updateDurationInput(id);
        if(id.startsWith('quantity-'))customQuantities[id.slice('quantity-'.length)]=event.target.value;
        const expense=extraExpenses.find(e=>id==='extra-value-'+e.id||id==='extra-label-'+e.id);
        if(expense)expense[id==='extra-value-'+expense.id?'amount':'name']=event.target.value;
        syncMaterials();scheduleCalculation();persistDraft();
    }
    function syncMaterials() {
        const config=calculationConfig(),catalog=config.catalog,prefs=palettePreferences(config);
        for(const key of MATERIAL_KEYS){const item=catalog.find(i=>i.id===key),field=document.getElementById('m-'+key),row=document.getElementById('row-'+key);row.style.order=prefs.order.indexOf(key);
            row.hidden=!item||!((!item.archived&&prefs.favorites.includes(key))||field.value!==''||field.validity?.badInput||draftInvalidFields.has('m-'+key)||selectedMaterials.has(key));}
    }
    function removeMaterial(key) {
        selectedMaterials.delete(key);
        if(!MATERIAL_KEYS.includes(key)){delete customQuantities[key];renderCustomMaterials();}
        else document.getElementById('m-'+key).value='';
        draftInvalidFields.delete(MATERIAL_KEYS.includes(key)?'m-'+key:'quantity-'+key);
        syncMaterials();calculate(false,true);persistDraft();
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
        if(raw.actualPrice!==undefined&&(typeof raw.actualPrice!=='number'||!Number.isFinite(raw.actualPrice)||raw.actualPrice<0||!Number.isSafeInteger(Math.round(raw.actualPrice*100))))return false;
        if(raw.durationMode!==undefined&&!['decimal','minutes'].includes(raw.durationMode))return false;
        if(raw.rentLinked!==undefined&&typeof raw.rentLinked!=='boolean')return false;
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
            ['name','recipe','date'].every(k => typeof i[k] === 'string') && (i.raw===undefined || validRaw(i.raw)) &&
            (i.catalogSnapshot===undefined||validCatalogSnapshot(i.catalogSnapshot)) &&
            (i.quotedTotal===undefined||(typeof i.quotedTotal==='number'&&Number.isFinite(i.quotedTotal)&&i.quotedTotal>=0)) &&
            (i.revision===undefined||(Number.isSafeInteger(i.revision)&&i.revision>=0)) &&
            (i.revisions===undefined||(Array.isArray(i.revisions)&&i.revisions.every(v=>v&&v.id===i.id&&v.date===i.date&&v.revisions===undefined&&validReceipt(v))));
    }
    function validCatalogSnapshot(items) {
        return Array.isArray(items)&&new Set(items.map(i=>i?.id)).size===items.length&&items.every(i=>i&&typeof i.id==='string'&&/^[a-z0-9-]+$/.test(i.id)&&typeof i.name==='string'&&i.name.trim()&&['г','мл','шт'].includes(i.unit)&&typeof i.unitPrice==='number'&&Number.isFinite(i.unitPrice)&&i.unitPrice>=0);
    }
    function historicalCatalog(receipt) {
        const items=receipt.catalogSnapshot??receipt.materialLines;
        return items.map(i=>({id:i.id,name:i.name,unit:i.unit,price:i.unitPrice,pack:1,archived:false}));
    }
    function editableReceipt(receipt) {
        if(!receipt?.raw||!validRaw(receipt.raw)||!receipt.rates||Object.keys(DEFAULT_SETTINGS).some(k=>typeof receipt.rates[k]!=='number'||!Number.isFinite(receipt.rates[k])||receipt.rates[k]<0))return false;
        const items=receipt.catalogSnapshot??receipt.materialLines;
        if(!validCatalogSnapshot(items))return false;
        const ids=new Set(items.map(i=>i.id));
        return !BUILTIN_MATERIALS.some(([id,,,key])=>Number(receipt.raw[key])>0&&!ids.has(id))&&!Object.entries(receipt.raw.customQuantities||{}).some(([id,qty])=>Number(qty)>0&&!ids.has(id));
    }
    function renderSaveDisclosure() {
        document.getElementById('save-status').innerText=editSession
            ?'Изменения сохранятся только в этом браузере, без повторной отправки в Google Forms.'
            :googleSendEnabled()?'Новый чек будет сохранён в этом браузере. Google Forms: при наличии сети будет попытка отправки; приём не подтверждается.'
            :'Новый чек будет сохранён в этом браузере. Отправка в Google Forms отключена.';
    }
    function showSaveResult(message) {const result=document.getElementById('save-result');result.innerText='Последнее сохранение: '+message;result.hidden=false;}
    function updateEditUI() {
        document.getElementById('edit-banner').hidden=!editSession;
        document.getElementById('save-receipt').innerText=editSession?'Сохранить изменения':'Сохранить чек';
        document.getElementById('edit-message').innerText=editSession?'Редактирование чека от '+editSession.original.date+'. Сохранены исходные тарифы, названия и цены. Доступны только материалы с сохранёнными историческими ценами; цены остальных материалов неизвестны. Отправки в Google Forms не будет.':'';
        renderSaveDisclosure();
    }
    function startReceiptEdit(id) {
        try {
            if(editSession)throw new Error('Сначала сохраните или отмените текущее редактирование.');
            if(draftBlocked)throw new Error('Сначала сохраните исходные данные повреждённого черновика или начните новый расчёт.');
            const original=readHistory().find(i=>i.id===id);
            if(!editableReceipt(original))throw new Error('Редактирование недоступно: исходные тарифы или цены материалов не сохранены.');
            const previousDraft=captureDraft();
            const session={original:JSON.parse(JSON.stringify(original)),token:JSON.stringify(original),previousDraft};
            editSession=session;draftId=newDraftId();updateEditUI();
            applyRaw(original.raw);document.getElementById('calc-client-name').value=original.name;
            refreshCatalog();syncPaymentModes();
            // Save the session before leaving the receipt view; failure keeps the prior source intact.
            if(!persistDraft()){editSession=null;updateEditUI();resetCalculationForm();if(hasDraftContent(previousDraft))restoreDraft();calculate(false,true);draftStatus('Сеанс редактирования не начат: запись черновика недоступна. Исходные данные сохранены.',true);return false;}
            openTab('calc',document.querySelector('.tab-btn'));document.getElementById('receipt-dialog').close();calculate(false,true);return true;
        }catch(error){showToast(error.message,true);return false;}
    }
    function restorePreviousDraft(previousDraft) {
        // One replacement retains the old edit session if storage fails.
        if(hasDraftContent(previousDraft))localStorage.setItem(DRAFT_KEY,JSON.stringify(previousDraft));else localStorage.removeItem(DRAFT_KEY);
        resetCalculationForm();
        if(hasDraftContent(previousDraft))restoreDraft();else clearDraft();
        refreshCatalog();calculate(false,true);
    }
    function cancelReceiptEdit() {
        if(!editSession)return false;
        try {restorePreviousDraft(editSession.previousDraft);return true;}catch(error){showToast('Не удалось вернуть черновик. Сеанс редактирования сохранён. '+error.message,true);return false;}
    }
    function receiptVersion(receipt) {const version=JSON.parse(JSON.stringify(receipt));delete version.revisions;return version;}
    function checkedReceipt(history,id,token) {
        const receipt=history.find(i=>i.id===id);
        if(!receipt||JSON.stringify(receipt)!==token)throw new Error('Чек изменён или удалён в другой вкладке. Изменения не сохранены. Откройте актуальную версию заново.');
        return receipt;
    }
    function commitReceiptEdit() {
        const history=readHistory(),session=editSession;
        const original=checkedReceipt(history,session.original.id,session.token);
        const corrected={...original,...JSON.parse(JSON.stringify(currentCalc)),id:original.id,date:original.date,
            dateKey:original.dateKey,createdAt:original.createdAt,timezone:original.timezone,sourceDraftId:original.sourceDraftId,
            cloudStatus:original.cloudStatus,revision:(original.revision||0)+1,lastEditDraftId:draftId,
            revisions:[...(original.revisions||[]),receiptVersion(original)]};
        if(!validReceipt(corrected))throw new Error('Некорректная версия чека');
        localStorage.setItem(DB_KEY,JSON.stringify(history.map(i=>i.id===original.id?corrected:i)));
        refreshBackupStatus();
        try {restorePreviousDraft(session.previousDraft);}catch(error){invalidateCalculation();showToast('Изменения сохранены. Вернуть предыдущий черновик пока не удалось; он сохранён в сеансе. '+error.message,true);return;}
        showSaveResult('Изменения чека сохранены в этом браузере. Google Forms не отправлялся.');showToast('Изменения чека сохранены');
    }
    let viewedReceiptToken=null;
    function undoViewedReceipt() {return undoReceipt(viewedReceiptId,viewedReceiptToken,Number(document.getElementById('receipt-version').value));}
    function undoReceipt(id,token,revisionIndex=null) {
        try {const history=readHistory(),current=checkedReceipt(history,id,token);
            if(!current.revisions?.length)throw new Error('Нет предыдущей версии');
            const index=revisionIndex===null?current.revisions.length-1:revisionIndex;
            if(!Number.isSafeInteger(index)||index<0||index>=current.revisions.length)throw new Error('Версия не найдена');
            const previous=current.revisions[index];
            const restored={...previous,id:current.id,date:current.date,revision:(current.revision||0)+1,
                revisions:[...current.revisions,receiptVersion(current)]};
            if(!validReceipt(restored))throw new Error('Некорректная предыдущая версия');
            localStorage.setItem(DB_KEY,JSON.stringify(history.map(i=>i.id===id?restored:i)));
            refreshBackupStatus();renderHistory();openReceipt(id);showToast('Предыдущая версия восстановлена. Google Forms не отправлялся.');return true;
        }catch(error){showToast(error.message,true);return false;}
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
        const ok = !field.validity?.badInput && !draftInvalidFields.has(id) && (text !== '' || allowEmpty) && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value));
        field.setAttribute('aria-invalid', String(!ok));
        field.style.borderColor = ok ? '' : 'var(--danger)';
        if (!ok) { if (!quietCalculation) field.focus(); throw new Error(integer ? 'Введите целое неотрицательное количество' : 'Введите неотрицательное число в выделенном поле'); }
        return value;
    }
    function invalidateCalculation() {
        currentCalc = null;
        document.getElementById('res-box').style.display = 'none';
        document.getElementById('quick-total').innerText = '—';
        for(const id of ['quick-profit','quick-materials'])document.getElementById(id).innerText='—';
        document.getElementById('save-receipt').disabled = true;
        document.getElementById('quick-details').disabled = true;
        document.getElementById('palette-subtotal').innerText='Материалы: —';
    }
    function downloadJSON(value, filename) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], {type:'application/json'}));
        const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    // Lightweight change signatures are a reminder only, not an integrity check.
    function backupReceiptState(history=readHistory(),deleted=readDeleted()) {
        const signature=value=>{let hash=2166136261;const text=JSON.stringify(value);for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return text.length+':'+(hash>>>0);};
        return Object.fromEntries([...history.map(i=>['live:'+i.id,signature(i)]),...deleted.map(i=>['deleted:'+i.id,signature(i)])]);
    }
    function refreshBackupStatus() {
        try {
            const state=JSON.parse(localStorage.getItem(BACKUP_STATE_KEY)||'null'),current=backupReceiptState();
            const previous=state?.receipts||{};
            const changed=new Set([...Object.keys(current),...Object.keys(previous)].filter(id=>current[id]!==previous[id]).map(id=>id.split(':')[1])).size;
            document.getElementById('backup-status').innerText=state?.exportedAt?'Скачивание копии начато: '+new Date(state.exportedAt).toLocaleString('ru-RU')+'. Проверьте файл в загрузках.':'Резервная копия ещё не скачивалась в этом браузере.';
            const reminder=document.getElementById('backup-reminder');reminder.hidden=changed===0;
            reminder.innerText=changed?'Чеков с изменениями после последней копии: '+changed+'. Можно скачать новую копию в Настройках.':'';
        }catch(error){document.getElementById('backup-status').innerText='Не удалось проверить последнюю копию. '+error.message;}
    }
    function exportBackup() {
        try {
            const exportedAt=new Date().toISOString(),history=readHistory(),deleted=readDeleted();
            downloadJSON({app:'master-calc',schemaVersion:3,exportedAt,history,settings:getSettings(),config:getConfig(),deleted},'Master_Calc_Backup.json');
            try {localStorage.setItem(BACKUP_STATE_KEY,JSON.stringify({exportedAt,receipts:backupReceiptState(history,deleted)}));}
            catch(error){showToast('Скачивание начато, но отметку о копии сохранить не удалось. Проверьте файл в загрузках.',true);}
            refreshBackupStatus();
        }catch(e){showToast(e.message,true);}
    }
    async function importBackup(input) {
        if(editSession){input.value='';showToast('Сначала сохраните или отмените редактирование чека.',true);return;}
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
            let priorGoogle;try{priorGoogle=getConfig().googleSend;}catch(error){}
            const importedConfig=backup.schemaVersion===3?{...backup.config,...(backup.config.googleSend===undefined&&priorGoogle!==undefined?{googleSend:priorGoogle}:{})}:null;
            const settingsChanged=Object.keys(DEFAULT_SETTINGS).filter(key=>getSettings()[key]!==backup.settings[key]).length;
            const preview=`Предпросмотр импорта\n${warning}Новых чеков: ${merged.length-existing.length}. Текущих сохранится: ${existing.length}. Совпадающие ID сохраняют текущую версию.\nТарифов с изменениями: ${settingsChanged}.${backup.schemaVersion===3?' Каталог ('+backup.config.catalog.length+') и шаблоны ('+backup.config.templates.length+') и избранное будут взяты из файла.'+(backup.config.googleSend===undefined?' Настройка Google останется текущей.':' Настройка Google будет взята из файла. Сейчас в файле: '+(backup.config.googleSend?'включена.':'отключена.')):' Каталог, шаблоны и настройка Google останутся текущими.'}\nТекущий расчёт: состав сбросится; имя клиента останется. ${draftBlocked?'Невосстановленный черновик останется без изменений.':'Черновик обновится.'}\nПрименить импорт? Отмена ничего не меняет.`;
            if (!confirm(preview)) return;
            const previous = {[DB_KEY]:localStorage.getItem(DB_KEY), [SETTINGS_KEY]:localStorage.getItem(SETTINGS_KEY),[CONFIG_KEY]:localStorage.getItem(CONFIG_KEY),[TRASH_KEY]:localStorage.getItem(TRASH_KEY)};
            localStorage.setItem('master_calc_palette_before_import', JSON.stringify(previous));
            try {
                localStorage.setItem(DB_KEY, JSON.stringify(merged));
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings));
                if(backup.schemaVersion===3)localStorage.setItem(CONFIG_KEY,JSON.stringify(importedConfig));
                if(backup.deleted)localStorage.setItem(TRASH_KEY,JSON.stringify(mergeHistory(readDeleted(),backup.deleted)));
            } catch(e) {
                for (const [key,value] of Object.entries(previous)) {
                    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value);
                }
                throw e;
            }
            invalidateCalculation(); loadSettings(); applyRaw({});refreshCatalog();refreshTemplates();
            // Import resets composition while retaining the current client and panel context.
            persistDraft();refreshBackupStatus();renderClientSuggestions();showToast(`Восстановлено. Чеков: ${merged.length}`);
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
        if (id === 'settings') {loadSettings();refreshCatalog();refreshTemplates();refreshBackupStatus();}
        if (id === 'calc') calculate(false,true);
        window.scrollTo(0, 0);
    }

    async function getContact() {
        if (!('contacts' in navigator)) return showToast("Нет доступа к контактам", true);
        try {
            const c = await navigator.contacts.select(['name'], { multiple: false });
            if (c.length > 0) { document.getElementById('calc-client-name').value = c[0].name[0]; scheduleCalculation(); persistDraft(); }
        } catch (e) {}
    }

    function googleSendEnabled() {return getConfig().googleSend!==false;}
    function saveGooglePreference() {
        try {const config=getConfig();config.googleSend=document.getElementById('google-send').checked===true;persistConfig(config);calculate(false,true);showToast(config.googleSend?'Google Forms: включена попытка отправки новых чеков. Приём не подтверждается.':'Отправка новых чеков в Google Forms отключена.');}
        catch(error){showToast(error.message,true);loadSettings();}
    }
    function getSettings() {
        try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); }
        catch(e) { return {...DEFAULT_SETTINGS}; }
    }

    function loadSettings() {
        const s = getSettings();
        try{document.getElementById('google-send').checked=googleSendEnabled();}catch(error){showToast(error.message,true);}
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
        renderSaveDisclosure();syncPaymentModes();
        if(document.getElementById('duration-display').value==='minutes')for(const kind of ['work','rent'])if(!document.getElementById(kind+'-duration-parts').hidden){const hours=readNumber(kind+'-hours',true),minutes=readNumber(kind+'-minutes',true);if(minutes>=60)throw new Error('Минуты должны быть от 0 до 59');}
        const s = editSession?editSession.original.rates:getSettings();
        const clientName = document.getElementById('calc-client-name').value.trim();
        const wTime = readNumber('work-time');


        const rentMode=editSession?(editSession.original.raw.rentMode||'hourly'):'hourly';
        const workMode=document.getElementById('work-mode').value||'hourly';
        if(!['hourly','fixed'].includes(workMode)||!['hourly','fixed','none'].includes(rentMode))throw new Error('Выберите режим оплаты');
        const workFixed=workMode==='fixed'?readNumber('work-fixed'):0;
        const rentFixed=editSession?(editSession.original.raw.rentFixed||0):0;
        const extraBase=readNumber('extra-cost');
        const taxPercent=readNumber('tax-percent'),feePercent=readNumber('fee-percent');
        const coverDeductions=document.getElementById('cover-deductions').checked===true;
        const extraLines=extraExpenses.map(e=>({id:e.id,name:e.name,amount:readNumber('extra-value-'+e.id)}));
        const extraName=document.getElementById('extra-name').value.trim();
        const rTime = readNumber('rent-time');
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

        const config=calculationConfig(), materialLines=[];
        const legacyQuantities={gE,gB,gN,gNC,gP,gO,gBoost};
        if(editSession){const ids=new Set(config.catalog.map(i=>i.id));if(BUILTIN_MATERIALS.some(([id,,,key])=>legacyQuantities[key]>0&&!ids.has(id))||Object.keys(customQuantities).some(id=>!ids.has(id)))throw new Error('Историческая цена этого материала не сохранена. Добавление недоступно.');}
        for(const item of config.catalog) {
            const builtin=BUILTIN_MATERIALS.find(([id])=>id===item.id);
            const qty=builtin?legacyQuantities[builtin[3]]:(Object.hasOwn(customQuantities,item.id)?readNumber('quantity-'+item.id,item.unit==='шт',true):0);
            if(item.unit==='шт' && !Number.isInteger(qty))throw new Error('Количество штучного материала должно быть целым');
            if(qty>0)materialLines.push({id:item.id,name:item.name,unit:item.unit,quantity:qty,unitPrice:materialPrice(item,s),cost:MasterCalcCore.cents(qty*materialPrice(item,s))/100});
        }
        const quote=MasterCalcCore.calculateQuote({work:workAmount,rent:rentAmount,consumables:consumablesAmount,
            materials:materialLines.map(i=>i.cost),extras:[extraBase,...extraLines.map(e=>e.amount)],
            markupRate:s.mark,taxRate:taxPercent/100,feeRate:feePercent/100,coverDeductions,
            ...(document.getElementById('actual-price-enabled').checked?{actualPrice:readNumber('actual-price')}:{})});
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
        const manual=document.getElementById('actual-price-enabled').checked;
        document.getElementById('res-quote').innerText='Расчётная цена: '+moneyText(quote.quotedTotal)+(manual?' · Разница: '+moneyText(total-quote.quotedTotal):'');
        document.getElementById('actual-price-note').innerText=manual?'Фактическая цена закреплена и не меняется при изменении состава. Расчётная цена: '+moneyText(quote.quotedTotal)+' · Разница: '+moneyText(total-quote.quotedTotal):'Цена следует расчёту.';
        document.getElementById('negative-income').hidden=profit>=0;
        document.getElementById('res-profit').innerText = 'Доход после расходов: ' + moneyText(profit);

        document.getElementById('res-box').style.display = 'block';
        if (scroll) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

        currentCalc = {
            id: Date.now(), date: new Date().toLocaleDateString('ru-RU'),
            sourceDraftId:draftId, schemaVersion:3, dateKey:dateKey(), createdAt:new Date().toISOString(), timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
            // calculationConfig retains historical material authority even when its quantity becomes zero.
            rates:{...s}, catalogSnapshot:config.catalog.map(i=>({id:i.id,name:i.name,unit:i.unit,unitPrice:materialPrice(i,s)})), materialLines, quotedTotal:quote.quotedTotal, breakdown:{salary, rent, consumables, matCost, markup, extraCost,taxCost,feeCost}, moneyCents:quote.cents, cloudStatus:'not-confirmed',
            name: clientName || 'Без имени',
            recipe: recipeArr.length > 0 ? recipeArr.join(', ') : 'Без мат-в',
            total, profit, exp, workTime: wTime,
            raw: { ...(document.getElementById('actual-price-enabled').checked?{actualPrice:total}:{}),durationMode:document.getElementById('duration-display').value||'decimal',rentLinked:document.getElementById('rent-link').checked===true,wTime, rTime, cCount, rType, gE, gB, gN, gNC, gP, gO, gBoost, workMode,rentMode,workFixed,rentFixed,extraCost:extraBase,extraName,taxPercent,feePercent,coverDeductions,extraExpenses:extraLines,customQuantities:Object.fromEntries(Object.keys(customQuantities).map(id=>[id,readNumber('quantity-'+id,false,true)])) }
        };
        document.getElementById('quick-total').innerText = moneyText(total);
        document.getElementById('quick-profit').innerText=moneyText(profit);document.getElementById('quick-profit').style.color=profit<0?'var(--danger)':'';document.getElementById('quick-materials').innerText=moneyText(matCost);
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
            if(editSession){commitReceiptEdit();return;}
            const history=readHistory();
            currentCalc.id=history.reduce((next,i)=>Math.max(next,i.id+1),Date.now());
            currentCalc.cloudStatus='local-only';
            const receipt=JSON.parse(JSON.stringify(currentCalc));
            localStorage.setItem(DB_KEY,JSON.stringify([receipt,...history]));
            localSaved=true;
            const sendGoogle=googleSendEnabled();
            let message=sendGoogle?'Чек сохранён в этом браузере. Без сети отправка в Google Forms не выполнялась.':'Чек сохранён в этом браузере. Отправка в Google Forms отключена.';
            if(sendGoogle&&navigator.onLine!==false){
                try {
                    submitToGoogle(receipt);
                    receipt.cloudStatus='attempted-unconfirmed';
                    localStorage.setItem(DB_KEY,JSON.stringify([receipt,...history]));
                    message='Чек сохранён в этом браузере. Google Forms: отправка инициирована, приём не подтверждён.';
                } catch(error) { message='Чек сохранён в этом браузере. Отправку в Google Forms подтвердить не удалось.'; }
            }
            showSaveResult(message);
            if(!draftBlocked){clearDraft();draftBlocked=false;}
            resetCalculationForm();refreshBackupStatus();
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
        if(!confirm('Обновить приложение? Оно перезагрузится. Локально сохранённые история и черновик останутся. Изменения, которые не удалось сохранить, могут потеряться.'))return;
        navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});
        updateRegistration.waiting.postMessage({type:'SKIP_WAITING'});
    }

    function renderHistory(more = false) {
        historyLimit = more ? historyLimit + 50 : 50;
        const all=readHistory(), from=document.getElementById('history-from').value,to=document.getElementById('history-to').value;
        if(from && to && from>to) {document.getElementById('period-stats').innerText='Начало периода должно быть раньше конца';document.getElementById('history-list').innerHTML='';document.getElementById('history-count').innerText='';document.getElementById('history-more').hidden=true;document.getElementById('stat-total').innerText='—';return;}
        const h=all.filter(i=>{const day=receiptDate(i);return (!from&&!to)||day&&(!from||day>=from)&&(!to||day<=to);});
        const sums=h.reduce((s,i)=>({total:s.total+i.total,exp:s.exp+i.exp,profit:s.profit+i.profit}),{total:0,exp:0,profit:0});
        document.getElementById('period-stats').innerText=`Чеков: ${h.length} · Выручка: ${moneyText(sums.total)} · Расходы и удержания: ${moneyText(sums.exp)} · Доход: ${moneyText(sums.profit)} · Средний чек: ${moneyText(h.length?sums.total/h.length:0)}${(from||to)&&all.some(i=>!receiptDate(i))?' · Записи без распознанной даты исключены':''}`;
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
                <button class="btn btn-view" onclick="openReceipt(${i.id})">Открыть чек</button>
                <button class="btn-del" onclick="deleteItem(${i.id})" title="Удалить" aria-label="Удалить чек">✖</button>
                <div style="font-size:12px; color:var(--text-muted); margin-bottom: 4px;">${escapeHTML(i.date)}</div>
                <div style="font-weight:700; color:var(--text-main); font-size: 16px;">${escapeHTML(i.name)}</div>
                <div style="font-size:13px; color:var(--text-muted); margin: 6px 0;"><b>Материалы:</b> ${escapeHTML(i.recipe)}</div>
                <div class="hint">${i.cloudStatus==='attempted-unconfirmed'?'Сохранён здесь · Google Forms: приём не подтверждён':'Сохранён здесь'}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px;">
                    <span style="color:var(--${i.profit<0?'danger':'success'}); font-weight: 700;">Доход: ${moneyText(i.profit)}</span>
                    <span style="color:var(--text-muted); font-size: 14px;">Чек: ${moneyText(i.total)}</span>
                </div>
            </div>`).join('') || '<p class="hint">Чеков не найдено</p>';
        document.getElementById('history-count').innerText = `Показано ${Math.min(historyLimit,filtered.length)} из ${filtered.length}`;
        document.getElementById('history-more').hidden = historyLimit >= filtered.length;
    }

    function clientSuggestions(query) {
        const search=String(query).trim().toLocaleLowerCase('ru');
        if(!search)return [];
        return readHistory().filter(i=>i.name.toLocaleLowerCase('ru').includes(search)).sort((a,b)=>b.id-a.id).slice(0,8);
    }
    function renderClientSuggestions() {
        const region=document.getElementById('client-suggestions');
        try {const visits=clientSuggestions(document.getElementById('calc-client-name').value);region.hidden=!visits.length;
            region.innerHTML=visits.map(i=>`<div class="client-visit"><button type="button" class="client-name-choice" onclick="selectClientVisit(${i.id})"><b>${escapeHTML(i.name)}</b><span>${escapeHTML(i.date)} · ${moneyText(i.total)}</span></button><button type="button" class="btn" onclick="openReceipt(${i.id})" aria-label="Открыть чек от ${escapeHTML(i.date)}">Чек</button></div>`).join('');
        }catch(error){region.hidden=true;}
    }
    function selectClientVisit(id) {
        const visit=readHistory().find(i=>i.id===id);if(!visit)return false;
        document.getElementById('calc-client-name').value=visit.name;
        document.getElementById('client-suggestions').hidden=true;scheduleCalculation();persistDraft();return true;
    }
    function openReceipt(id) {
        try {const item=readHistory().find(i=>i.id===id);if(!item)throw new Error('Чек не найден');
            const rows=[['Цена клиенту',item.total],...(Number.isFinite(item.quotedTotal)?[['Расчётная цена',item.quotedTotal],['Разница с расчётной ценой',item.total-item.quotedTotal]]:[]),[item.profit<0?'Отрицательный доход после расходов':'Доход после расходов',item.profit],['Расходы и удержания',item.exp]];
            document.getElementById('receipt-content').innerHTML=`<p>${escapeHTML(item.date)} · ${escapeHTML(item.name)}</p><p>Материалы: ${escapeHTML(item.recipe)}</p><p>Часы работы: ${item.workTime}</p>`+
                rows.map(([label,value])=>`<div class="receipt-row"><span>${label}</span><b>${moneyText(value)}</b></div>`).join('')+
                (item.materialLines?.length?'<details><summary>Сохранённые материалы и цены</summary>'+item.materialLines.map(i=>`<p>${escapeHTML(i.name)}: ${escapeHTML(i.quantity)} ${escapeHTML(i.unit)} × ${moneyText(i.unitPrice)} = ${moneyText(i.cost)}</p>`).join('')+'</details>':'')+
                `<p class="hint">Сохранён здесь${item.cloudStatus==='attempted-unconfirmed'?' · Google Forms: приём не подтверждён':''}. Просмотр не меняет текущий расчёт.</p>`;
            viewedReceiptId=id;document.getElementById('receipt-repeat').hidden=!item.raw;
            document.getElementById('receipt-actions').innerHTML=(editableReceipt(item)?`<button type="button" class="btn" onclick="startReceiptEdit(${id})">Изменить чек по сохранённым ценам</button>`:'<p class="hint">Редактирование недоступно: исходные тарифы или цены материалов не сохранены. Можно повторить по текущим ценам.</p>')+
                (item.revisions?.length?`<label for="receipt-version">Версия для восстановления</label><select id="receipt-version" class="search-bar">${item.revisions.map((v,index)=>`<option value="${index}" ${index===item.revisions.length-1?'selected':''}>${index===0?'Исходная версия':'Версия '+(index+1)} · ${moneyText(v.total)}</option>`).join('')}</select><button type="button" class="btn" onclick="undoViewedReceipt()">Восстановить выбранную версию</button><p class="hint">Все ${item.revisions.length} предыдущих версий сохранены.</p>`:'');
            viewedReceiptToken=JSON.stringify(item);
            const dialog=document.getElementById('receipt-dialog');if(!dialog.open)dialog.showModal();return true;
        }catch(error){showToast(error.message,true);return false;}
    }
    function clientSummary(receipt) {
        return `Расчёт для клиента: ${receipt.name}\nДата: ${receipt.date}\nЦена: ${moneyText(receipt.total)}${receipt.raw?.actualPrice!==undefined&&Number.isFinite(receipt.quotedTotal)?'\nРасчётная цена: '+moneyText(receipt.quotedTotal)+'\nРазница: '+moneyText(receipt.total-receipt.quotedTotal):''}`;
    }
    async function copyClientSummary(id=null) {
        try {
            let receipt;if(id!==null)receipt=readHistory().find(i=>i.id===id);else{if(!calculate(false))return false;receipt=currentCalc;}
            if(!receipt)throw new Error('Чек не найден');
            const text=clientSummary(receipt);
            if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);showToast('Текст для клиента скопирован.');return true;}catch(error){}}
            document.getElementById('client-copy-text').value=text;const dialog=document.getElementById('client-copy-dialog');if(!dialog.open)dialog.showModal();document.getElementById('client-copy-text').focus();document.getElementById('client-copy-text').select();showToast('Выделите и скопируйте текст вручную.');return false;
        }catch(error){showToast(error.message,true);return false;}
    }

    function loadReceipt(id) {
        if(editSession){showToast('Сначала сохраните или отмените редактирование чека.',true);return false;}
        const h = readHistory();
        const item = h.find(i => i.id === id);
        if (!item || !item.raw) return showToast("Не удалось загрузить данные", true);

        if(!protectCurrentCalculation())return false;
        openTab('calc', document.querySelector('.tab-btn'));

        try {editSession=null;updateEditUI();applyRaw(recipeRaw(item.raw));document.getElementById('calc-client-name').value=item.name;syncMaterials();persistDraft();document.getElementById('client-suggestions').hidden=true;document.getElementById('receipt-dialog').close();if(calculate(false))showToast('Новый расчёт по текущим тарифам');}
        catch(error){invalidateCalculation();showToast(error.message,true);}
    }

    function readDeleted(){const deleted=JSON.parse(localStorage.getItem(TRASH_KEY)||'[]');if(!Array.isArray(deleted)||!deleted.every(validReceipt))throw new Error('Повреждена корзина удалённых чеков');return deleted;}
    function deleteItem(id) {
        if(!confirm('Удалить чек из истории? Его можно восстановить. Из Google Forms запись не удаляется.'))return;
        try {
            const history=readHistory(),item=history.find(i=>i.id===id);if(!item)return;
            localStorage.setItem(TRASH_KEY,JSON.stringify(mergeHistory(readDeleted(),[item])));
            localStorage.setItem(DB_KEY,JSON.stringify(history.filter(i=>i.id!==id)));
            renderHistory();refreshBackupStatus();renderClientSuggestions();showToast('Чек перенесён в удалённые');
        }catch(error){showToast('Удаление не выполнено: '+error.message,true);}
    }
    function restoreDeleted(){try{
        const deleted=readDeleted();if(!deleted.length){showToast('Удалённых чеков нет');return;}
        localStorage.setItem(DB_KEY,JSON.stringify(mergeHistory(readHistory(),deleted)));
        localStorage.removeItem(TRASH_KEY);renderHistory();refreshBackupStatus();renderClientSuggestions();showToast('Удалённые чеки восстановлены');
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
        let csv = "\uFEFFДата;Клиент;Рецепт;Часы;Выручка;Доход после расходов;Расходы и удержания\n";
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

    let summaryActivationPointer=null, summaryReleaseFrame=null;
    function releaseSummaryActivation() {
        if(summaryReleaseFrame!==null)cancelAnimationFrame(summaryReleaseFrame);
        summaryReleaseFrame=null;summaryActivationPointer=null;
        document.getElementById('mobile-summary').classList.remove('activation-pending');
    }
    function beginSummaryActivation(event) {
        if(event.isPrimary===false||event.button!==0)return;
        releaseSummaryActivation();
        if(!document.activeElement?.matches('#calc input')||event.target.closest?.('#mobile-summary'))return;
        summaryActivationPointer=event.pointerId;
        document.getElementById('mobile-summary').classList.add('activation-pending');
    }
    function finishSummaryPointer(event) {
        if(summaryActivationPointer!==event.pointerId)return;
        // Normal click releases after its target handler. A release without click
        // is cleaned up at the next rendering opportunity, after pointer hit-testing.
        summaryReleaseFrame=requestAnimationFrame(releaseSummaryActivation);
    }

    window.onload = function() {
        try { migrateOldData(); } catch(e) { showToast('История не изменена: ' + e.message,true); }
        loadSettings();
        window.addEventListener('pointerdown',beginSummaryActivation,true);
        window.addEventListener('pointerup',finishSummaryPointer,true);
        window.addEventListener('click',releaseSummaryActivation);
        window.addEventListener('pointercancel',releaseSummaryActivation);
        window.addEventListener('blur',releaseSummaryActivation);
        document.getElementById('calc').addEventListener('input',handleCalculationInput);
        document.getElementById('calc').addEventListener('change',handleCalculationInput);
        window.addEventListener('pagehide',persistDraft);
        for(const id of ['extras-panel','templates-panel'])document.getElementById(id).addEventListener('toggle',()=>{if(hasDraftContent())persistDraft();});
        document.getElementById('calc').addEventListener('keydown',paletteKeyboard);
        try {refreshCatalog();refreshTemplates();}catch(e){showToast(e.message,true);}
        restoreDraft();
        calculate(false,true);refreshBackupStatus();
        initOffline();
    };
