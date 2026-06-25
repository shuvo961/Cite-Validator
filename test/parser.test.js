import test from "node:test";
import assert from "node:assert/strict";
import { parseReference, splitReferences } from "../src/parser.js";

test("splits blank-line separated references", () => {
  const refs = splitReferences("One. 2020.\n\nTwo. 2021.");
  assert.equal(refs.length, 2);
});

test("splits wrapped numbered bibliography references without blank lines", () => {
  const refs = splitReferences(`6 S. Grimme and P. R. Schreiner, Computational Chemistry:
The Fate of Current Methods and Future Challenges,
Angew. Chem., Int. Ed., 2017, 57, 4170-4176.
7R. Iftimie, P. Minary and M. E. Tuckerman, Ab initio
molecular dynamics: Concepts, recent developments, and
future trends, Proc. Natl. Acad. Sci. U.S.A., 2005, 102, 6654
6659.
8 Z. Yang and K. Houk, The dynamics of chemical reactions:
atomistic visualizations of organic reactions, and homage
to van't Hoff, Chem.-Eur. J., 2018, 24, 3916-3924.`);
  assert.equal(refs.length, 3);
  assert.match(refs[0], /^6 S\. Grimme/);
  assert.match(refs[1], /^7R\. Iftimie/);
  assert.match(refs[2], /^8 Z\. Yang/);
});

test("splits OCR-style DOI-delimited references without blank lines", () => {
  const refs = splitReferences(`AnandN,ChangKC,YehAC, etal (2023)Developmentofacomprehensivemodel
forpredictingmeltpool characteristicswithdissimilarmaterials inselective laser
meltingprocesses. Journal ofMaterialsProcessingTechnology319:118069. https:
//doi.org/10.1016/j.jmatprotec.2023.118069
BaldiN,GiorgettiA,PolidoroA, etal (2023)Asupervisedmachine learningmodel
forregressiontopredictmeltpool formationandmorphologyinlaserpowderbed
fusion.AppliedSciences14(1):328.https://doi.org/10.3390/app14010328
BedeianAG,MossholderKW(2000)Ontheuseof thecoefficientofvariationasa
measureofdiversity.OrganizationalResearchMethods3(3):285-297.https://doi.
org/10.1177/109442810033005
51
2347
2348
2349
2350
ChernyavskyD,KononenkoDY,HufenbachJK,etal(2025)Bayesianoptimizationfor
laserpowderbedfusionofdefect-freeaa2024.AdditiveManufacturing114:105022.
https://doi.org/10.1016/j.addma.2025.105022`);
  assert.equal(refs.length, 4);
  assert.match(refs[0], /^AnandN/);
  assert.match(refs[1], /^BaldiN/);
  assert.match(refs[2], /^BedeianAG/);
  assert.match(refs[3], /^ChernyavskyD/);
  assert.doesNotMatch(refs.join(" "), /\b2348\b/);
});

test("splits flattened DOI-delimited references from query strings", () => {
  const refs = splitReferences(`AnandN,ChangKC,YehAC, etal (2023)Developmentofacomprehensivemodel forpredictingmeltpool characteristicswithdissimilarmaterials inselective laser meltingprocesses. Journal ofMaterialsProcessingTechnology319:118069. https: //doi.org/10.1016/j.jmatprotec.2023.118069 BaldiN,GiorgettiA,PolidoroA, etal (2023)Asupervisedmachine learningmodel forregressiontopredictmeltpool formationandmorphologyinlaserpowderbed fusion.AppliedSciences14(1):328.https://doi.org/10.3390/app14010328 BedeianAG,MossholderKW(2000)Ontheuseof thecoefficientofvariationasa measureofdiversity.OrganizationalResearchMethods3(3):285-297.https://doi. org/10.1177/109442810033005 CastaNedaPhdJ,ArrietaA,HeuvelT,etal (2023)Thesignificanceofcoefficientof variationasameasureofhypoglycaemiariskandglycaemiccontrol inrealworld usersof theautomated insulindeliveryminimed780gsystem.Diabetes,Obesity andMetabolism25:2545-2552.https://doi.org/10.1111/dom.15139 51 2347 2348 2349 2350 2351 2352 2353 2354 2355 2356 2357 ChernyavskyD,KononenkoDY,HufenbachJK,etal(2025)Bayesianoptimizationfor laserpowderbedfusionofdefect-freeaa2024.AdditiveManufacturing114:105022. https://doi.org/10.1016/j.addma.2025.105022 CunninghamR,ZhaoC,ParabN,etal(2019)Keyholethresholdandmorphologyin lasermeltingrevealedbyultrahigh-speedx-rayimaging.Science363(6429):849-852. https://doi.org/10.1126/science.aav4687`);
  assert.equal(refs.length, 6);
  assert.match(refs[0], /^AnandN/);
  assert.match(refs[1], /^BaldiN/);
  assert.match(refs[4], /^ChernyavskyD/);
  assert.match(refs[5], /^CunninghamR/);
  assert.doesNotMatch(refs.join(" "), /\b2357\b/);
});

test("extracts DOI, year, title, and type hint", () => {
  const parsed = parseReference("Harris, C. R. (2020). Array programming with NumPy. Nature, 585, 357-362. https://doi.org/10.1038/s41586-020-2649-2");
  assert.equal(parsed.doi, "10.1038/s41586-020-2649-2");
  assert.equal(parsed.year, "2020");
  assert.match(parsed.title, /Array programming/i);
  assert.equal(parsed.typeGuess, "article");
});
