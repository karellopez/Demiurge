// One-off helper: pulls osculating elements for the moons at J2000 from JPL
// Horizons, parent-centred and referred to the ecliptic of J2000, so that the
// values written into `data/bodies.json` are sourced rather than invented.
// Not part of the build; run by hand when the catalogue gains a moon.

const MOONS = {
  moon: ['301', '500@399'],
  phobos: ['401', '500@499'],
  deimos: ['402', '500@499'],
  io: ['501', '500@599'],
  europa: ['502', '500@599'],
  ganymede: ['503', '500@599'],
  callisto: ['504', '500@599'],
  mimas: ['601', '500@699'],
  enceladus: ['602', '500@699'],
  titan: ['606', '500@699'],
  iapetus: ['608', '500@699'],
  triton: ['801', '500@899'],
  charon: ['901', '500@999'],
  ceres: ['1;', '500@10'],
  eris: ['136199;', '500@10'],
};

const read = (block, key) => {
  const match = new RegExp(String.raw`\b${key}\s*=\s*(\S+)`, 'u').exec(block);
  return match === null ? null : Number(match[1]);
};

const round = (value, places) => (value === null ? null : Number(value.toFixed(places)));

const out = {};
for (const [name, [id, center]] of Object.entries(MOONS)) {
  const parameters = new URLSearchParams({
    format: 'text',
    COMMAND: `'${id}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'ELEMENTS'",
    CENTER: `'${center}'`,
    REF_PLANE: "'ECLIPTIC'",
    OUT_UNITS: "'KM-S'",
    START_TIME: "'2000-01-01 12:00'",
    STOP_TIME: "'2000-01-01 13:00'",
    STEP_SIZE: "'1h'",
  });

  const response = await fetch(
    `https://ssd.jpl.nasa.gov/api/horizons.api?${parameters.toString()}`,
  );
  const text = await response.text();

  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start === -1 || end === -1) {
    console.error(name, 'FAILED', text.slice(0, 300));
    continue;
  }

  const block = text.slice(start + 5, end);
  const semiMajorAxisKm = read(block, 'A');
  const periodSeconds = read(block, 'PR');

  out[name] = {
    semiMajorAxisKm: round(semiMajorAxisKm, 3),
    eccentricity: round(read(block, 'EC'), 7),
    inclinationDeg: round(read(block, 'IN'), 6),
    longitudeOfAscendingNodeDeg: round(read(block, 'OM'), 6),
    argumentOfPeriapsisDeg: round(read(block, 'W'), 6),
    meanAnomalyDeg: round(read(block, 'MA'), 6),
    orbitalPeriodDays: round(periodSeconds === null ? null : periodSeconds / 86_400, 8),
  };
  console.error(`  ok    ${name}`);
}

console.log(JSON.stringify(out, null, 2));
