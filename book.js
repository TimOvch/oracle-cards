(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const READING_KEY='oracle-textbook:semester07:reading:v1';
  let course,cards,chapters,concepts,cardMap,currentChapter=null,scrollTimer=null;
  let storageWarning=false;
  const params=new URLSearchParams(location.search);
  if (!location.hash && ['block','level','card'].some(key=>params.has(key))) {
    location.replace('cards.html'+location.search);
    return;
  }
  function readPosition() {
    try {
      const v=JSON.parse(localStorage.getItem(READING_KEY)||'null');
      if(!v||typeof v.chapter!=='string'||typeof v.section!=='string')return null;
      if(chapters&&!chapters.get(v.chapter)?.sections.some(s=>s.id===v.section))return null;
      return {...v,offset:Number.isFinite(v.offset)?Math.max(0,v.offset):0};
    } catch{return null;}
  }
  function rememberPosition() {
    if(!currentChapter)return;
    const sections=[...document.querySelectorAll('.section')];
    let selected=sections[0];
    for(const section of sections)if(section.getBoundingClientRect().top<=160)selected=section;
    if(!selected)return;
    const position={chapter:currentChapter,section:selected.dataset.section,
      offset:Math.max(0,Math.round(-selected.getBoundingClientRect().top)),updatedAt:new Date().toISOString()};
    try{localStorage.setItem(READING_KEY,JSON.stringify(position));}catch{storageWarning=true;}
    for(const a of document.querySelectorAll('.toc [data-section-link]'))a.classList.toggle('active',a.dataset.sectionLink===position.section);
  }
  const readURL=(chapter,section='overview')=>`#/read/${chapter}/${section}`;
  const reviewURL=(chapter,section)=>'cards.html?chapter='+encodeURIComponent(chapter)+(section?'&section='+encodeURIComponent(section):'');
  function link(chapter,section,label,cls='') {return `<a class="${cls}" href="${readURL(chapter,section)}">${escape(label)}</a>`;}
  function statusNotice() {return storageWarning?'<p class="storage-warning" role="status">Браузер запретил сохранение. В этом сеансе можно читать и повторять; после закрытия место и новые оценки могут не сохраниться.</p>':'';}

  function home() {
    const saved=readPosition(),ch=saved&&chapters.get(saved.chapter);
    const resume=ch?`<a class="button primary" href="${readURL(ch.id,saved.section)}?resume">Продолжить: ${escape(ch.title)}</a>`
      :'<a class="button primary" href="#/read/architecture/overview">Начать с архитектуры</a>';
    return `<div class="hero"><p class="eyebrow">Учебник · Oracle Database 11g Release 2</p><h1>Сначала понять.<br>Затем связать.</h1><p class="lead">Пройди путь от устройства Oracle до транзакций и undo. Читай последовательно, исследуй связи и возвращайся к нужному объяснению из карточек.</p><div class="actions">${resume}<a class="button" href="#/map/course">Посмотреть карту курса ↗</a></div></div>
      <div class="course-intro"><h2>Десять глав, одна система</h2><p class="quiet">Блоки 1–3 · ${course.concepts.length} понятий · ${cards.cards.length} карточек</p></div>
      <div class="chapter-grid">${course.chapters.map(ch=>`<a class="chapter-tile" href="${readURL(ch.id)}"><span>ГЛАВА ${String(ch.number).padStart(2,'0')} · БЛОК ${ch.block}</span><h3>${escape(ch.title)}</h3><p>${escape(ch.question)}</p><small>${ch.sections.length} разделов · около ${ch.minutes} мин чтения →</small></a>`).join('')}</div>${statusNotice()}`;
  }
  function ratings(id) {
    const status=OracleStudy.loadProgress().cards[id]?.status;
    return `<div class="rating" data-rating-for="${escape(id)}"><button type="button" data-rate="review" data-card="${escape(id)}" aria-pressed="${status==='review'}">↺ Повторить</button><button type="button" data-rate="known" data-card="${escape(id)}" aria-pressed="${status==='known'}">✓ Знаю</button><span class="rating-note">${status==='known'?'Отмечено: знаю':status==='review'?'Отмечено: повторить':'Без оценки'}</span></div>`;
  }
  function inlineCard(id) {
    const c=cardMap.get(id),l=c.answer_layers||{},ev=c.teacher_evidence||{};
    const corrections=(l.documentation_correction||[]).map(t=>`<p class="correction">${escape(t)}</p>`).join('');
    const speech=ev.text?`<details class="teacher-details"><summary>Преподаватель и источник</summary><p>${escape(ev.recording||'Обработанная учебная запись')} · ${escape(ev.time_range||'локатор не установлен')}</p><blockquote>${escape(ev.text)}</blockquote><small>Обработанный фрагмент, не дословная стенограмма.</small></details>`:'';
    const additions=(l.documentation_addition||[]).filter(Boolean);
    const depth=additions.length?`<details class="extra-details"><summary>Дополнение по документации</summary>${additions.map(t=>`<p>${escape(t)}</p>`).join('')}</details>`:'';
    return `<details class="inline-card" id="question-${escape(id)}"><summary>${escape(c.front)}<span class="card-level">${c.level==='advanced'?'углубление':'фундамент'}</span></summary><div class="card-body"><p>${escape(l.default_defense_answer||c.answer_short)}</p>${corrections}${c.answer_deep?`<p class="card-deep">${escape(c.answer_deep)}</p>`:''}${speech}${depth}${ratings(id)}<a class="quiet" href="cards.html?card=${encodeURIComponent(id)}">Открыть в режиме повторения →</a></div></details>`;
  }
  function practice(section) {
    if(!section.card_ids.length)return '';
    const ordered=[...section.card_ids].sort((a,b)=>(cardMap.get(a).level==='advanced')-(cardMap.get(b).level==='advanced'));
    return `<details class="practice"><summary>Остановиться и повторить · ${ordered.length} ${ordered.length===1?'карточка':ordered.length<5?'карточки':'карточек'}</summary><p class="quiet">Необязательно. Сначала попробуй сформулировать ответ, затем раскрой его. Оценки общие с режимом «Повторить».</p>${ordered.map(inlineCard).join('')}</details>`;
  }
  function modelHTML(model) {
    if(model==='composite')return `<div class="model" data-model="composite"><p class="eyebrow">Попробовать механизм</p><h3>Один набор строк — два порядка ключа</h3><p class="model-note">Учебная модель обычного поиска по ведущему ключу. Skip scan и выбор плана оптимизатором здесь не моделируются.</p><div class="model-controls"><label>Порядок индекса<select id="key-order"><option value="ab">(Отдел, Оклад)</option><option value="ba">(Оклад, Отдел)</option></select></label><label>Отдел =<select id="key-a"><option value="">Любой</option><option value="10">10</option><option value="20" selected>20</option><option value="30">30</option></select></label><label>Оклад ≥<select id="key-b"><option value="">Любой</option><option value="100">100</option><option value="200">200</option><option value="300">300</option></select></label></div><div id="key-rows" class="key-rows"></div><p id="key-result" class="model-result" role="status"></p><p class="model-note">Зелёный — найденные строки; жёлтый — просмотренные, но отсеянные. Порядок чтения: слева направо, затем следующая строка. ROWID здесь обозначен номером строки.</p></div>`;
    return `<div class="model" data-model="undo"><p class="eyebrow">Пройти по шагам</p><h3>Два сеанса и две версии значения</h3><p class="model-note">Учебная модель READ COMMITTED. Команды не отправляются в базу.</p><label for="undo-step">Шаг <span id="undo-step-number">1</span> из 6</label><input id="undo-step" type="range" min="0" max="5" value="0" step="1"><div class="model-controls"><button id="undo-prev" type="button">← Назад</button><button id="undo-next" type="button">Далее →</button></div><h3 id="undo-title"></h3><div class="undo-values"><div><small>Текущий блок</small><strong id="undo-current"></strong></div><div><small>Зафиксированное значение</small><strong id="undo-committed"></strong></div></div><p class="quiet" id="undo-history-state"></p><label class="history-control"><input id="undo-history" type="checkbox" checked>Нужная завершённая история сохранена</label><p class="model-note" id="undo-history-note">До COMMIT активное undo нельзя перезаписать ради новых изменений.</p><p id="undo-reader" class="undo-reader" role="status"></p><p id="undo-explanation" class="model-result"></p></div>`;
  }
  function chapterHTML(ch) {
    const index=course.chapters.indexOf(ch),prev=course.chapters[index-1],next=course.chapters[index+1];
    const local=`<details ${innerWidth>750?'open':''}><summary>В этой главе</summary>${ch.sections.map(s=>`<a data-section-link="${s.id}" href="${readURL(ch.id,s.id)}">${escape(s.title)}</a>`).join('')}</details>`;
    return `<div class="reading"><aside class="toc"><a class="course-back" href="#/course">← Оглавление курса</a>${local}</aside><article class="article"><p class="eyebrow">Глава ${ch.number} · Блок ${ch.block}</p><h1>${escape(ch.title)}</h1><p class="lead">${escape(ch.question)}</p><p class="requires">${ch.requires.length?'Перед чтением: '+ch.requires.map(id=>link(id,'summary',chapters.get(id).title)).join(' · '):'Можно начать без предварительных глав.'}</p><div class="actions chapter-actions"><a href="#/map/${ch.id}">Связи этой темы ↗</a><a href="${reviewURL(ch.id)}">Повторить тему →</a></div>${ch.sections.map(s=>`<section class="section" id="section-${s.id}" data-section="${s.id}"><div class="section-title"><h2>${escape(s.title)}</h2><a class="quiet" aria-label="Связи: ${escape(s.title)}" href="#/map/${ch.id}/${course.concepts.find(c=>c.chapter===ch.id&&c.section===s.id)?.id||ch.concept_ids[0]}">Связи ↗</a></div><div class="prose">${s.html}</div>${s.model?modelHTML(s.model):''}${practice(s)}</section>`).join('')}<details class="source-box"><summary>Источники и границы объяснения</summary><p>${escape(ch.source_scope)}</p><ul>${ch.docs.map(url=>`<li><a target="_blank" rel="noopener noreferrer" href="${escape(url)}">Oracle 11.2 · ${escape(url.split('/').pop().replace('.htm',''))}</a></li>`).join('')}</ul><p>Примеры объясняют механизм и не являются результатами выполнения на учебной базе. Оригинальные слайды и записи на сайте не публикуются.</p></details><nav class="chapter-nav" aria-label="Соседние главы">${prev?link(prev.id,'overview','← '+prev.title):'<a href="#/course">← Оглавление</a>'}${next?link(next.id,'overview',next.title+' →'):'<a href="#/course">Вернуться к оглавлению →</a>'}</nav>${statusNotice()}</article></div>`;
  }
  function mapHTML(scope,selected) {
    const saved=readPosition();
    const back=saved&&chapters.has(saved.chapter)?`<a class="button" href="${readURL(saved.chapter,saved.section)}?resume">← Вернуться к чтению</a>`:'';
    const nav=`<div class="map-chapters"><a href="#/map/course" ${scope==='course'?'aria-current="page"':''}>Весь курс</a>${course.chapters.map(ch=>`<a href="#/map/${ch.id}" ${scope===ch.id?'aria-current="page"':''}>${ch.number}. ${escape(ch.title)}</a>`).join('')}</div>`;
    if(scope==='course')return `<div class="map-heading"><p class="eyebrow">Карта курса</p><h1>Как темы опираются друг на друга</h1><p class="lead">Порядок чтения указан номерами. Под каждой темой указано, какие знания она использует. Выбери тему, чтобы рассмотреть понятия и связи.</p></div>${nav}<div class="course-path">${course.chapters.map(ch=>`<div class="course-node"><h3><a href="#/map/${ch.id}">${ch.number}. ${escape(ch.title)}</a></h3><p class="quiet">${ch.requires.length?'Требует понимания: '+ch.requires.map(id=>`<a href="#/map/${id}">${escape(chapters.get(id).title)}</a>`).join(', '):'Начальная точка: файлы, память и процессы.'}</p><a class="quiet" href="${readURL(ch.id)}">Читать главу →</a></div>`).join('')}</div><div class="map-back">${back}</div>`;
    const ch=chapters.get(scope);
    if(!ch)return notFound();
    const own=course.concepts.filter(c=>c.chapter===scope);
    const focus=concepts.get(selected)?.chapter===scope?concepts.get(selected):own[0];
    const relevant=course.edges.filter(e=>e.source===focus.id||e.target===focus.id);
    const node=id=>{const c=concepts.get(id);return `<a class="edge-node ${id===focus.id?'selected':''}" href="#/map/${c.chapter}/${id}">${escape(c.label)}</a>`;};
    return `<div class="map-heading"><p class="eyebrow">Карта темы ${ch.number}</p><h1>${escape(ch.title)}</h1><p class="lead">Выбери понятие. Подпись стрелки объясняет отношение; она читается от левого узла к правому, на телефоне — сверху вниз.</p></div>${nav}<div class="concept-pills" aria-label="Понятия темы">${own.map(c=>`<a href="#/map/${scope}/${c.id}" ${c.id===focus.id?'aria-current="page"':''}>${escape(c.label)}</a>`).join('')}</div><div class="concept-focus"><p class="eyebrow">${escape(focus.label)}</p><h2>${escape(focus.label)}</h2><p>${escape(focus.definition)}</p><div class="actions">${link(focus.chapter,focus.section,'Открыть объяснение →','button primary')}<a class="button" href="${reviewURL(focus.chapter,focus.card_ids.length?focus.section:null)}">${focus.card_ids.length?'Повторить понятие':'Повторить тему'}</a></div></div><div class="relationships" aria-label="Схема связей">${relevant.map(e=>`<div class="edge-row">${node(e.source)}<span class="edge-label">${escape(e.relation)}</span>${node(e.target)}</div>`).join('')}</div><details class="relation-list"><summary>Прочитать связи списком</summary><ul>${relevant.map(e=>`<li>${escape(concepts.get(e.source).label)} → <strong>${escape(e.relation)}</strong> → ${escape(concepts.get(e.target).label)}</li>`).join('')}</ul></details><div class="map-back">${back}</div>`;
  }
  function normalize(value) {return value.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/<[^>]+>/g,' ');}
  function searchHTML(query) {
    const words=normalize(query).trim().split(/\s+/).filter(Boolean);
    if(!words.length)return '<h1>Поиск по курсу</h1><p>Введи термин, имя команды или вопрос в поле поиска.</p>';
    const match=text=>words.every(w=>normalize(text).includes(w));
    const results=[];
    for(const c of course.concepts)if(match([c.label,c.definition,...c.aliases].join(' ')))results.push({type:'Понятие',title:c.label,text:c.definition,url:readURL(c.chapter,c.section)});
    for(const ch of course.chapters)for(const s of ch.sections)if(match(ch.title+' '+s.title+' '+s.text))results.push({type:'Раздел · '+ch.title,title:s.title,text:s.text.replace(/[#*`\[\]]/g,'').replace(/\s+/g,' ').slice(0,220)+'…',url:readURL(ch.id,s.id)});
    for(const c of cards.cards)if(match(c.front+' '+c.answer_short))results.push({type:'Карточка',title:c.front,text:c.answer_short,url:'cards.html?card='+encodeURIComponent(c.id)});
    return `<div class="search-results"><p class="eyebrow">Поиск</p><h1>${escape(query)}</h1><p role="status">${results.length?'Найдено: '+results.length:'Ничего не найдено. Попробуй другой термин или английское название.'}</p>${results.map(r=>`<a class="search-result" href="${r.url}"><small>${escape(r.type)}</small><h3>${escape(r.title)}</h3><p>${escape(r.text)}</p></a>`).join('')}</div>`;
  }
  function notFound() {return '<h1>Этот раздел не найден</h1><p>Ссылка могла устареть. Все главы доступны в оглавлении.</p><a class="button" href="#/course">Открыть оглавление</a>';}
  function renderModels() {
    if($('key-order')) {
      const order=$('key-order').value;
      const values=OracleStudy.composite(order,$('key-a').value,$('key-b').value);
      $('key-rows').innerHTML=values.map(r=>`<div class="key-row ${r.match?'matched':r.scan?'scanned':''}">${order==='ab'?r.a+', '+r.b:r.b+', '+r.a}<small>строка ${r.id}</small></div>`).join('');
      const scans=values.filter(r=>r.scan).length,found=values.filter(r=>r.match).length;
      $('key-result').textContent=`В выбранном способе доступа просмотрено ${scans} из ${values.length} записей, найдено ${found}. ${order==='ab'?'Сначала сгруппирован отдел.':'Сначала сгруппирован оклад.'}`;
    }
    if($('undo-step')) {
      const step=Number($('undo-step').value),value=OracleStudy.undo(step,$('undo-history').checked);
      $('undo-step-number').textContent=step+1;$('undo-title').textContent=value.title;
      $('undo-current').textContent=value.current;$('undo-committed').textContent=value.committed;
      $('undo-history-state').textContent='Undo: '+value.undo;$('undo-reader').textContent=value.reader;
      $('undo-explanation').textContent=value.explanation;$('undo-prev').disabled=step===0;$('undo-next').disabled=step===5;
      $('undo-history').disabled=step<3;
      $('undo-history-note').textContent=step<3?'До COMMIT активное undo нельзя перезаписать ради новых изменений.':'Для сравнения можно выбрать альтернативную ветку: завершённое undo было перезаписано до чтения A.';
    }
  }
  function updateRatings() {
    const progress=OracleStudy.loadProgress();
    for(const row of document.querySelectorAll('[data-rating-for]')) {
      const state=progress.cards[row.dataset.ratingFor]?.status;
      for(const b of row.querySelectorAll('[data-rate]'))b.setAttribute('aria-pressed',String(b.dataset.rate===state));
      row.querySelector('.rating-note').textContent=state==='known'?'Отмечено: знаю':state==='review'?'Отмечено: повторить':'Без оценки';
    }
  }
  function openTerm(id) {
    const c=concepts.get(id);if(!c)return;
    $('term-title').textContent=c.label;$('term-definition').textContent=c.definition;
    $('term-links').innerHTML=link(c.chapter,c.section,'Полное объяснение →','button primary')+`<a class="button" href="#/map/${c.chapter}/${id}">Связи понятия ↗</a>`;
    $('glossary').showModal();
  }
  function render() {
    clearTimeout(scrollTimer);rememberPosition();currentChapter=null;
    const raw=location.hash.replace(/^#\/?/,'').split('/');
    const route=raw[0]||'course',scope=raw[1],section=(raw[2]||'overview').split('?')[0];
    if($('glossary').open)$('glossary').close();
    for(const a of document.querySelectorAll('[data-nav]')) {
      if(a.dataset.nav===(route==='map'?'map':'read'))a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    }
    if(route==='course')$('main').innerHTML=home();
    else if(route==='read'&&chapters.has(scope)) {
      const ch=chapters.get(scope);
      if(!ch.sections.some(s=>s.id===section)){$('main').innerHTML=notFound();window.scrollTo(0,0);return;}
      $('main').innerHTML=chapterHTML(ch);currentChapter=scope;renderModels();
      const saved=readPosition();
      requestAnimationFrame(()=>{
        const target=$('section-'+section);
        if(!target||currentChapter!==scope)return;
        const resume=location.hash.endsWith('?resume')&&saved?.chapter===scope&&saved.section===section;
        if(section==='overview'&&!resume)window.scrollTo(0,0);
        else window.scrollTo(0,target.getBoundingClientRect().top+window.scrollY+(resume?saved.offset||0:-16));
        rememberPosition();
      });
      document.title=ch.title+' · Oracle';return;
    } else if(route==='map')$('main').innerHTML=mapHTML(scope||'course',raw[2]);
    else if(route==='search') {
      let query='';try{query=decodeURIComponent(raw.slice(1).join('/'));}catch{}
      $('search').value=query;$('main').innerHTML=searchHTML(query);
    } else $('main').innerHTML=notFound();
    document.title=route==='map'?'Карта курса · Oracle':route==='search'?'Поиск · Oracle':'Учебник Oracle';
    window.scrollTo(0,0);
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('.skip')){event.preventDefault();$('main').focus();window.scrollTo(0,0);return;}
    const term=event.target.closest('a[href^="#term/"]');
    if(term){event.preventDefault();openTerm(term.getAttribute('href').slice(6));return;}
    const rating=event.target.closest('[data-rate]');
    if(rating){try{OracleStudy.mark(rating.dataset.card,rating.dataset.rate);updateRatings();}catch{rating.closest('.rating').querySelector('.rating-note').textContent='Браузер запретил сохранение оценки.';}return;}
    if(event.target.closest('.dialog-close'))$('glossary').close();
    if(event.target.closest('#undo-prev')){$('undo-step').value=Math.max(0,Number($('undo-step').value)-1);renderModels();}
    if(event.target.closest('#undo-next')){$('undo-step').value=Math.min(5,Number($('undo-step').value)+1);renderModels();}
  });
  document.addEventListener('change',e=>{if(e.target.closest('[data-model]'))renderModels();});
  document.addEventListener('input',e=>{if(e.target.id==='undo-step')renderModels();});
  window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(rememberPosition,150);},{passive:true});
  window.addEventListener('pagehide',rememberPosition);
  window.addEventListener('storage',e=>{if(e.key===OracleStudy.KEY)updateRatings();});
  window.addEventListener('pageshow',()=>{if(course)updateRatings();});
  $('search-form').addEventListener('submit',event=>{event.preventDefault();location.hash='/search/'+encodeURIComponent($('search').value.trim());});
  window.addEventListener('hashchange',render);
  Promise.all(['textbook-data.json','cards-data.json'].map(async file=>{
    const response=await fetch(file,{cache:'no-store'});if(!response.ok)throw Error('Не удалось загрузить '+file);return response.json();
  })).then(([data,bank])=>{
    course=data;cards=bank;chapters=new Map(course.chapters.map(c=>[c.id,c]));concepts=new Map(course.concepts.map(c=>[c.id,c]));cardMap=new Map(cards.cards.map(c=>[c.id,c]));render();
  }).catch(error=>{$('main').innerHTML='<h1>Учебник не загрузился</h1><p>Проверь соединение и обнови страницу.</p><a class="button" href="cards.html">Открыть карточки</a>';console.error(error);});
})();
