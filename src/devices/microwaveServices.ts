/**
 * The services the microwave publishes, by the name an owner uses for them in
 * `microwave_services`, each with the subtype(s) HomeKit knows it by. The
 * Television carries its nine input sources, since they mean nothing without it.
 */
export const MICROWAVE_SERVICES: Record<string, string[]> = {
  fan: ['YourUniqueIdentifier-59F'],
  light: ['YourUniqueIdentifier-59L'],
  power_level: ['YourUniqueIdentifier-59SP'],
  turn_off: ['CataNicoGaTa-Control8Off'],
  television: [
    'NicoCataGaTa-OvenOven7',
    'NicoCataGaTa-Oven1003',
    'NicoCata-Always15',
    'NicoCataGaTa-Oven1004',
    'NicoCataGaTa-Oven1004T',
    'NicoCata-Always4',
    'NicoCata-Always1',
    'NicoCata-Always2',
    'NicoCata-Always2T',
    'NicoCata-Always3',
  ],
  cook_time: ['NicoCataGaTa-OvenT2'],
  timer: ['NicoCataGaTa-OvenT32'],
  temperature_control: ['NicoCataGaTa-OvenTC'],
  start: ['CataNicoGaTa-Control8'],
  stop: ['CataNicoGaTa-Control6'],
  mode_microwave: ['CataNicoGaTa-80M'],
  mode_combination_bake: ['CataNicoGaTa-80B'],
  mode_dehydrate: ['CataNicoGaTa-80d'],
  mode_oven: ['CataNicoGaTa-80OVen'],
  mode_convection_bake: ['CataNicoGaTa-Control1'],
  mode_combination_roast: ['CataNicoGaTa-Control2'],
  mode_time_defrost: ['CataNicoGaTa-Control3'],
  mode_defrost: ['CataNicoGaTa-Control3D'],
  mode_air_fry: ['CataNicoGaTa-Control4'],
  mode_proof: ['CataNicoGaTa-Control5'],
  mode_warm: ['CataNicoGaTa-Control5W'],
};
