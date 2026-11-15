import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const dictionary = JSON.parse(await readFile(new URL('../app/data/koreanCityNames.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../app/utils/koreanCityNames.ts', import.meta.url), 'utf8');
const module = {exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:()=>dictionary});
const localize=module.exports.localizedCityName;
const context={locale:'ko',selectedGame:'ets2',activeMod:'none'};
test('offline city names require exact identity and known base-map context',()=>{
 const calais={token:'calais',name:'Calais',countryToken:'france'};
 const munich={token:'munchen',name:'Munich',countryToken:'germany'};
 const list=[calais,munich];
 assert.equal(localize(calais,list,context),'칼레');
 assert.equal(localize(munich,list,context),'뮌헨');
 for(const patch of [{countryToken:'germany'},{token:'custom'},{name:'Calais harbour'}]) {const city={...calais,...patch};assert.equal(localize(city,[city],context),city.name);}
 for(const patch of [{locale:'en'},{selectedGame:'ats'},{activeMod:'promods-europe'}]) assert.equal(localize(calais,list,{...context,...patch}),'Calais');
 assert.equal(localize(calais,[calais,{...calais,name:'Other'}],context),'Calais');
 assert.equal(localize({token:'unknown',name:'Unknown',countryToken:'france'},list,context),'Unknown');
});
test('dictionary carries attribution and unambiguous labels',()=>{
 assert.match(dictionary.attribution.license,/제1유형/);
 const seen=new Set();
 for(const r of dictionary.records){const key=r.token+'|'+r.countryToken+'|'+r.originalName;assert.ok(!seen.has(key));seen.add(key);assert.match(r.koreanName,/^[-가-힣· ]+$/);assert.ok(r.sourceDescription);}
 assert.ok(dictionary.records.find(r=>r.token==='munchen').aliasEvidence.includes('Landeshauptstadt München'));
});

test('verified countries are localized only alongside verified Korean cities',()=>{
 const country=module.exports.localizedCityCountry;
 const munich={token:'munchen',name:'Munich',countryToken:'germany'};
 const calais={token:'calais',name:'Calais',countryToken:'france'};
 const unknown={token:'unknown',name:'Unknown',countryToken:'germany'};
 const list=[munich,calais,unknown];
 assert.equal(country(munich,list,context),'독일');assert.equal(country(calais,list,context),'프랑스');
 assert.equal(country(unknown,list,context),null);
 assert.equal(country(munich,list,{...context,locale:'en'}),null);
 assert.equal(country(munich,list,{...context,activeMod:'promods-europe'}),null);
 assert.equal(country(munich,list,{...context,selectedGame:'ats'}),null);
 assert.ok(!dictionary.records.some(r=>r.token==='vaasa'));
 assert.ok(!dictionary.countries.some(r=>r.countryToken==='kosovo'||r.countryToken==='luxembourg'));
});

test('country dictionary uses the current Türkiye name rather than the 2018 legacy label',()=>{
 const country=dictionary.countries.find(r=>r.countryToken==='turkey');
 assert.equal(country.koreanName,'튀르키예');
 assert.ok(country.sourceUrl.includes('qna_seq=327130'));
 assert.ok(!dictionary.countries.some(r=>r.koreanName==='터키'));
});
