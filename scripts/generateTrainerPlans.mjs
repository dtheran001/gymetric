import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('docs/generated');
fs.mkdirSync(outDir, { recursive: true });
const stamp = '2026-08-31';

const defs = {
  inclinePress: ['Press inclinado con mancuernas','chest','dumbbell','Mancuernas'], inclineFly: ['Aperturas inclinadas','chest','dumbbell','Mancuernas'], bench: ['Press banca plano','chest','barbell','Barra'], flatFly: ['Aperturas planas','chest','dumbbell','Mancuernas'], dips: ['Fondos','chest','bodyweight','Peso corporal'], trunk: ['Flexión de tronco','core','bodyweight','Peso corporal'], hipRaise: ['Elevaciones de cadera','core','bodyweight','Peso corporal'],
  pulldown: ['Jalón al frente','back','cable','Polea'], seatedRow: ['Remo sentado','back','cable','Polea'], reversePulldown: ['Jalón con agarre invertido','back','cable','Polea'], barRow: ['Remo con barra','back','barbell','Barra'], pullover: ['Pull over','back','other','Otro'], standingCalf: ['Gemelo de pie','legs','machine','Máquina'], seatedCalf: ['Gemelo sentado','legs','machine','Máquina'],
  inclineLegPress: ['Prensa inclinada','legs','machine','Máquina'], extension: ['Extensiones de cuádriceps','legs','machine','Máquina'], hack: ['Sentadilla hack','legs','machine','Máquina'], flatLegPress: ['Prensa plana','legs','machine','Máquina'],
  machineShoulder: ['Press de hombro en máquina','shoulders','machine','Máquina'], frontRaise: ['Elevación frontal con barra o disco','shoulders','free_weight','Barra o disco'], uprightRow: ['Remo al cuello','shoulders','barbell','Barra'], lateralRaise: ['Elevaciones laterales','shoulders','dumbbell','Mancuernas'], reverseFly: ['Pájaros','shoulders','dumbbell','Mancuernas'], shrug: ['Encogimientos de trapecio','shoulders','free_weight','Peso libre'],
  pushdown: ['Jalones rectos de tríceps','arms','cable','Polea'], french: ['Press francés con barra','arms','barbell','Barra'], rope: ['Jalones de tríceps con cuerda','arms','cable','Polea'], kickback: ['Patadas de tríceps en polea','arms','cable','Polea'], barCurl: ['Curl con barra','arms','barbell','Barra'], dumbbellCurl: ['Curl con mancuernas','arms','dumbbell','Mancuernas'], scott: ['Curl Scott','arms','other','Banco Scott'], concentration: ['Curl concentrado','arms','dumbbell','Mancuerna'],
  lyingCurl: ['Curl femoral tumbado','legs','machine','Máquina'], deadlift: ['Peso muerto con barra','legs','barbell','Barra'], closeLyingCurl: ['Curl femoral tumbado con pies juntos','legs','machine','Máquina'], adductor: ['Aductor','legs','machine','Máquina'],
};
const exercises = Object.entries(defs).map(([id,[name,muscleGroup,equipmentKind,equipment]]) => ({ id:`trainer-${id}`, name, muscleGroup, equipment, equipmentKind, notes:'', isCustom:true }));

let uid = 0;
function ex(key, reps, drops = {}, restSeconds = 90, notes) {
  const id = `rx-${key}-${++uid}`; const sets = [];
  reps.forEach((rep, baseIndex) => {
    sets.push({ id:`${id}-s${baseIndex+1}`, kind:'normal', targetReps:rep, targetWeightKg:null, _baseIndex:baseIndex });
    for (let d=0; d<(drops[baseIndex]??0); d++) sets.push({ id:`${id}-s${baseIndex+1}-d${d+1}`, kind:'drop', targetReps:null, targetWeightKg:null, toFailure:true, _baseIndex:baseIndex });
  });
  return { id, exerciseId:`trainer-${key}`, restSeconds, notes, sets };
}
function stepsForBase(e, baseIndex) { return e.sets.filter(s=>s._baseIndex===baseIndex).map(s=>({routineExerciseId:e.id,setId:s.id})); }
function sequential(e) { return [...new Set(e.sets.map(s=>s._baseIndex))].flatMap(i=>stepsForBase(e,i)); }
function pair(a,b,pattern) {
  const order = pattern==='2-1' ? [[a,0],[a,1],[b,0],[a,2],[b,1],[b,2]] : [[a,0],[b,0],[b,1],[a,1],[a,2],[b,2]];
  const used = new Set(order.map(([e,i])=>`${e.id}:${i}`));
  return [...order.flatMap(([e,i])=>stepsForBase(e,i)), ...[a,b].flatMap(e=>[...new Set(e.sets.map(s=>s._baseIndex))].filter(i=>!used.has(`${e.id}:${i}`)).flatMap(i=>stepsForBase(e,i)))];
}
function routine(id,name,days,items,pairs=[],conditioning) {
  const pairedIds=new Set(pairs.flatMap(p=>[p[0].id,p[1].id]));
  const executionSequence=[];
  for (const item of items) {
    const found=pairs.find(p=>p[0]===item);
    if(found) executionSequence.push(...pair(...found)); else if(!pairedIds.has(item.id)) executionSequence.push(...sequential(item));
  }
  items.forEach(e=>e.sets.forEach(s=>delete s._baseIndex));
  return { id, name, focus:name, estimatedMinutes:75, preferredDays:[days], collection:'Plan 31-08-26 · 6 días', notes:'90 segundos de descanso salvo indicación específica.', conditioning, exercises:items, executionSequence };
}
const cardio='35 minutos de cardio después del entrenamiento o en ayunas.';
function buildSixDay() {
  const a=ex('inclinePress',[12,12,12],{2:1}),b=ex('inclineFly',[12,12,12],{2:1}),c=ex('bench',[12,12,12],{2:1}),d=ex('flatFly',[12,12,12],{2:2}),e=ex('dips',[15,15,15]),f=ex('trunk',[18,18,18,18]),g=ex('hipRaise',[18,18,18,18]);
  const h=ex('pulldown',[12,12,12],{2:1}),i=ex('seatedRow',[12,12,12],{2:1}),j=ex('reversePulldown',[12,12,12],{2:1}),k=ex('barRow',[12,12,12],{2:2}),l=ex('pullover',[15,15,15]),m=ex('standingCalf',[18,18,18,18]),n=ex('seatedCalf',[18,18,18,18]);
  const o=ex('inclineLegPress',[12,12,10,10],{3:1},150),p=ex('extension',[12,12,10,10],{2:1,3:2},150),q=ex('hack',[12,12,12,12],{3:1},150),r=ex('flatLegPress',[12,12,12],{},150),s=ex('trunk',[18,18,18,18]),t=ex('hipRaise',[18,18,18,18]);
  const u=ex('machineShoulder',[12,12,12],{2:1}),v=ex('frontRaise',[12,12,12],{2:1}),w=ex('uprightRow',[12,12,12],{2:1}),x=ex('lateralRaise',[12,12,10,10],{2:1,3:2}),y=ex('reverseFly',[14,14,12,10],{2:1,3:2}),z=ex('shrug',[14,14,14,14],{3:1});
  const aa=ex('pushdown',[12,12,12],{2:1}),ab=ex('french',[12,12,12],{2:1}),ac=ex('rope',[12,12,12],{2:1}),ad=ex('kickback',[12,12,12],{2:1}),ae=ex('barCurl',[12,12,12],{2:1}),af=ex('dumbbellCurl',[12,12,12],{2:1}),ag=ex('scott',[12,12,12],{2:1}),ah=ex('concentration',[12,12,12]);
  const ai=ex('lyingCurl',[12,12,12,12],{3:1}),aj=ex('deadlift',[12,12,12],{2:1}),ak=ex('closeLyingCurl',[12,12,12,12],{3:1}),al=ex('adductor',[12,12,12,12],{3:1}),am=ex('seatedCalf',[18,18,18,18]),an=ex('standingCalf',[18,18,18,18]);
  return [routine('plan6-g1','Grupo 1 · Pectoral y abdominales','monday',[a,b,c,d,e,f,g],[[a,b,'2-1'],[c,d,'1-2']],cardio),routine('plan6-g2','Grupo 2 · Espalda y gemelo','tuesday',[h,i,j,k,l,m,n],[[h,i,'2-1'],[j,k,'1-2']],cardio),routine('plan6-g3','Grupo 3 · Cuádriceps y abdominales','wednesday',[o,p,q,r,s,t],[],cardio),routine('plan6-g4','Grupo 4 · Hombro','thursday',[u,v,w,x,y,z],[[u,v,'2-1'],[w,x,'1-2']],cardio),routine('plan6-g5','Grupo 5 · Tríceps y bíceps','friday',[aa,ab,ac,ad,ae,af,ag,ah],[[aa,ab,'2-1'],[ac,ad,'1-2'],[ae,af,'2-1'],[ag,ah,'1-2']],cardio),routine('plan6-g6','Grupo 6 · Femoral y gemelo','saturday',[ai,aj,ak,al,am,an],[],cardio)];
}
const six=buildSixDay();
function cloneRoutine(source,id,name,day,removeExerciseIds=[],extraSource,extraIncludeIds=[]) {
  const raw=structuredClone(source); let items=raw.exercises.filter(e=>!removeExerciseIds.includes(e.exerciseId));
  const baseItemIds=new Set(items.map(e=>e.id));
  const baseSequence=raw.executionSequence.filter(step=>baseItemIds.has(step.routineExerciseId));
  let extraItems=[]; let extraSequence=[];
  if(extraSource) { extraItems=structuredClone(extraSource.exercises.filter(e=>extraIncludeIds.includes(e.exerciseId) && !removeExerciseIds.includes(e.exerciseId))); const extraItemIds=new Set(extraItems.map(e=>e.id)); extraSequence=extraSource.executionSequence.filter(step=>extraItemIds.has(step.routineExerciseId)); items=[...items,...extraItems]; }
  raw.id=id; raw.name=name; raw.focus=name; raw.preferredDays=[day]; raw.collection='Plan 31-08-26 · 5 días'; raw.exercises=items; raw.executionSequence=[...baseSequence,...extraSequence]; return raw;
}
const five=[cloneRoutine(six[0],'plan5-g1','Día 1 · Pectoral y tríceps','monday',['trainer-dips','trainer-kickback'],six[4],['trainer-pushdown','trainer-french','trainer-rope','trainer-kickback']),cloneRoutine(six[1],'plan5-g2','Día 2 · Espalda y bíceps','tuesday',['trainer-pullover','trainer-concentration'],six[4],['trainer-barCurl','trainer-dumbbellCurl','trainer-scott','trainer-concentration']),cloneRoutine(six[2],'plan5-g3','Día 3 · Cuádriceps y abdominales','wednesday'),cloneRoutine(six[3],'plan5-g4','Día 4 · Hombro','thursday'),cloneRoutine(six[5],'plan5-g5','Día 5 · Femoral y gemelo','friday')];
const supplementNotes='Antes: 10 g BCAAs + 10 g glutamina + 3 g creatina + 1 g betalanina. Durante: 1,5 l agua + 2 g sal marina. Después: 10 g MAPS + 3 g creatina + 1 g betalanina.';
[...six,...five].forEach(r=>r.notes=`${r.notes} ${supplementNotes}`);
fs.writeFileSync(path.join(outDir,'gymetric-routines-danny-2026-08-31.json'),JSON.stringify({format:'gymetric-routines',schemaVersion:1,exportedAt:new Date().toISOString(),exercises,routines:[...six,...five]},null,2));

const item=(id,name,quantity,notes)=>({id,name,quantity,notes});
const fixed=(id,name,quantity,notes)=>({id,type:'item',item:item(`${id}-item`,name,quantity,notes)});
const choice=(id,label,opts)=>({id,type:'choice',label,options:opts.map((o,i)=>({id:`${id}-o${i+1}`,items:[item(`${id}-o${i+1}-i`,o[0],o[1])],notes:o[2]}))});
const meals=[
 {id:'fasting',name:'En ayunas',entries:[fixed('selenium','Selenio','200 mcg'),fixed('tiroxin','Tiroxin','2000 mg'),fixed('synephrine','P-sinefrina','60 mg')]},
 {id:'meal1',name:'Comida 1',entries:[fixed('eggs','Huevos enteros','2 unidades'),fixed('whites1','Claras','5 unidades'),choice('carb1','Elegir una fuente de hidratos',[['Avena','50 g'],['Crema de arroz','50 g'],['Copos de maíz','50 g'],['Espelta','50 g']]),fixed('multi','Multivitamínico','1 unidad'),fixed('omega1','Omega 3','1 g'),fixed('vitc','Vitamina C','1 unidad'),fixed('berberine1','Berberine','500 mg')]},
 {id:'meal2',name:'Comida 2',entries:[choice('carb2','Elegir una fuente de hidratos',[['Pan','60 g'],['Tortas de arroz','30 g']]),choice('protein2','Elegir una fuente de proteína',[['Lomo embuchado','100 g'],['Jamón','100 g'],['Sardinas','150 g'],['Caballa','150 g']])]},
 {id:'meal3',name:'Comida 3',entries:[choice('carb3','Elegir una fuente de hidratos',[['Arroz','50 g'],['Pasta','50 g'],['Patata','175 g'],['Boniato','175 g']]),choice('protein3','Elegir una fuente de proteína',[['Pollo','150 g'],['Carne roja','150 g','Máximo 2 días por semana']]),fixed('veg3','Verduras o ensalada','Cantidad libre','Aliñar con 5 ml de AOVE')]},
 {id:'meal4',name:'Comida 4',entries:[choice('protein4','Elegir una fuente de proteína',[['Claras','250 g'],['Pollo','150 g'],['Lomo fresco','150 g']]),choice('carb4','Elegir una fuente de hidratos',[['Avena','30 g'],['Tortas de arroz','30 g'],['Crema de arroz','30 g']]),fixed('nuts','Frutos secos','15 g')]},
 {id:'meal5',name:'Comida 5',entries:[choice('protein5','Elegir una fuente de proteína',[['Pescado','200 g','Tomar pescado azul 3 días por semana'],['Lomo fresco','150 g'],['Contramuslo','150 g']]),fixed('veg5','Verduras o ensalada','Cantidad libre','Aliñar con 5 ml de aceite de oliva virgen'),fixed('yogurt','Yogur natural','1 unidad'),choice('carb5','Elegir una fuente de hidratos',[['Avena','30 g'],['Crema de arroz','30 g']]),fixed('omega5','Omega 3','1 g'),fixed('q10','Q10','200 mg'),fixed('berberine5','Berberine','500 mg')]},
];
const diet={id:'diet-danny-2026-08-31',name:'Plan nutricional · 31-08-26',objective:'Plan nutricional de Danny Theran',startDate:stamp,notes:'Todos los pesos son en crudo. Comer aproximadamente cada 3 horas. Cocinar al horno, a la plancha u otros métodos sin fritura. Café e infusiones permitidos; preferiblemente con leche vegetal, desnatada o sin lactosa. Sal al gusto, preferiblemente yodada o rosa del Himalaya. Agua libre: al menos 2–3 litros al día.',isCurrent:false,createdAt:new Date().toISOString(),days:[{id:'standard-day',name:'Plan diario',meals}]};
fs.writeFileSync(path.join(outDir,'gymetric-diet-danny-2026-08-31.json'),JSON.stringify({format:'gymetric-diets',schemaVersion:1,exportedAt:new Date().toISOString(),diets:[diet]},null,2));
