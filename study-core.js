/* Shared card persistence and educational models. No network or Oracle calls. */
(function (root) {
  'use strict';
  const KEY = 'oracle-study-cards:semester07-block01:v2';
  function loadProgress(storage) {
    try {
      storage = storage || root.localStorage;
      const data = JSON.parse(storage.getItem(KEY) || '{}');
      return data && typeof data.cards === 'object' && data.cards !== null && !Array.isArray(data.cards)
        ? data : {version:1,cards:{}};
    } catch { return {version:1,cards:{}}; }
  }
  function mark(id,status,storage = root.localStorage) {
    if (!['known','review'].includes(status)) throw Error('Unknown card rating');
    const data=loadProgress(storage);
    data.cards[id]={status,updatedAt:new Date().toISOString()};
    storage.setItem(KEY,JSON.stringify(data));
    return data;
  }
  const rows = [
    {id:1,a:10,b:100},{id:2,a:10,b:200},{id:3,a:10,b:300},
    {id:4,a:20,b:100},{id:5,a:20,b:200},{id:6,a:20,b:300},
    {id:7,a:30,b:100},{id:8,a:30,b:200},{id:9,a:30,b:300},
  ];
  function composite(order='ab',a='',minB='') {
    if (!['ab','ba'].includes(order)) throw Error('Invalid key order');
    const lead=order[0],tail=order[1];
    const sorted=rows.map(r=>({...r})).sort((x,y)=>x[lead]-y[lead]||x[tail]-y[tail]||x.id-y.id);
    const match = r=>(a===''||r.a===Number(a))&&(minB===''||r.b>=Number(minB));
    // Prefix range only: skip scans and the cost-based optimizer are outside
    // this model. An inequality on the leading key leaves a trailing filter.
    const scan = r=>lead==='a'
      ? (a==='' ? true : r.a===Number(a)&&(minB===''||r.b>=Number(minB)))
      : (minB==='' ? true : r.b>=Number(minB));
    return sorted.map(r=>({...r,scan:scan(r),match:match(r)}));
  }
  const undoSteps = [
    {title:'Читатель A начинает SELECT',current:100,committed:100,undo:'Пока не требуется',reader:'A ещё не получил нужный блок.',explanation:'Момент чтения A зафиксирован до изменения. Модель использует READ COMMITTED и один длинный запрос.'},
    {title:'Писатель B: UPDATE 100 → 150',current:150,committed:100,undo:'100 · активная транзакция',reader:'Новый обычный читатель пока увидит 100.',explanation:'B держит строковую блокировку. Незавершённое undo нельзя отдать новым изменениям.'},
    {title:'Другой читатель обращается до COMMIT',current:150,committed:100,undo:'100 · активная транзакция',reader:'Обычный SELECT получает 100 через согласованное чтение.',explanation:'Текущий блок уже изменён, но чужое незавершённое значение 150 не показывается.'},
    {title:'Писатель B выполняет COMMIT',current:150,committed:150,undo:'100 · история после фиксации',reader:'A всё ещё нужен снимок до изменения.',explanation:'COMMIT завершает транзакцию B и освобождает её блокировки. История не стирается автоматически.'},
    {title:'Новый SELECT после COMMIT',current:150,committed:150,undo:'100 · история после фиксации',reader:'Новый запрос видит 150; A ещё не прочитал свой блок.',explanation:'Запросы, начавшиеся в разное время, могут читать разные зафиксированные состояния.'},
    {title:'A добирается до изменённого блока',current:150,committed:150,undo:'100 · нужна для A',reader:'A получает 100.',explanation:'Oracle восстанавливает версию для A. Текущее значение таблицы остаётся 150.'},
  ];
  function undo(step,history=true) {
    const index=Math.max(0,Math.min(undoSteps.length-1,Number(step)||0));
    const value={...undoSteps[index],step:index};
    if (!history && index>=3) {
      value.undo='Нужная история перезаписана';
      if(index===5) {
        value.reader='ORA-01555: snapshot too old';
        value.explanation='Альтернативная ветка модели: нужное завершённое undo было разрешено повторно использовать до чтения A. Сам COMMIT не является причиной стирания.';
      }
    }
    return value;
  }
  root.OracleStudy=Object.freeze({KEY,loadProgress,mark,composite,undo,undoSteps});
})(globalThis);
