import React, { useEffect, useMemo, useState } from 'react';

import {

  MapContainer,

  TileLayer,

  Polygon,

  CircleMarker,

  useMapEvents,

  useMap,

} from 'react-leaflet';



import 'leaflet/dist/leaflet.css';

import { FOREST_LOCATIONS } from './forestLocations';



const API = 'http://127.0.0.1:8000';



function MapClicks({ drawing, onPoint }) {

  useMapEvents({

    click(e) {

      if (drawing) {

        onPoint([e.latlng.lat, e.latlng.lng]);

      }

    },

  });



  return null;

}





function MapLocationController({ location }) {

  const map = useMap();



  useEffect(() => {

    if (!location) return;

    map.flyTo([location.lat, location.lng], 13, {

      duration: 1.4,

    });

  }, [location, map]);



  return null;

}



function Stat({ label, value }) {

  return (

    <div className="stat">

      <span>{label}</span>

      <strong>{value ?? '—'}</strong>

    </div>

  );

}



const forestLocations = FOREST_LOCATIONS.map((location) => ({

  ...location,

  forestType: location.forestType || location.forest_type,

  densityTreesPerHa: location.densityTreesPerHa || location.tree_density_per_ha,

  avgBiomassPerTreeKg: location.avgBiomassPerTreeKg || location.avg_biomass_kg_per_tree,

}));



export default function App() {

  const [points, setPoints] = useState([]);

  const [drawing, setDrawing] = useState(false);

  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);

  const [error, setError] = useState('');



  const [dateFrom, setDateFrom] = useState('2025-01-01');

  const [dateTo, setDateTo] = useState('2026-09-23');

  const [cloud, setCloud] = useState(20);

  const [ndviMode, setNdviMode] = useState(false);



  // Forest change detection

  const [beforeFrom, setBeforeFrom] = useState('2025-01-01');

  const [beforeTo, setBeforeTo] = useState('2025-06-30');

  const [afterFrom, setAfterFrom] = useState('2026-01-01');

  const [afterTo, setAfterTo] = useState('2026-06-30');

  const [changeLoading, setChangeLoading] = useState(false);

  const [changeResult, setChangeResult] = useState(null);

  const [changeError, setChangeError] = useState('');



  // AI tree detection

  const [treeModelStatus, setTreeModelStatus] = useState(null);

  const [treeFile, setTreeFile] = useState(null);

  const [treeLoading, setTreeLoading] = useState(false);

  const [treeResult, setTreeResult] = useState(null);

  const [treeError, setTreeError] = useState('');



  // Forest location presets / AOI tree-density estimation

  const [selectedLocationId, setSelectedLocationId] = useState('');

  const [locationSearch, setLocationSearch] = useState('');

  const [showLocationResults, setShowLocationResults] = useState(false);



  const selectedLocation = useMemo(

    () => forestLocations.find((location) => location.id === selectedLocationId) || null,

    [selectedLocationId]

  );



  const filteredLocations = useMemo(() => {

    const query = locationSearch.trim().toLowerCase();

    const matches = !query

      ? forestLocations

      : forestLocations.filter((location) =>

          `${location.name} ${location.country} ${location.region} ${location.forestType}`

            .toLowerCase()

            .includes(query)

        );

    return matches.slice(0, 8);

  }, [locationSearch]);



  const center = [12.842, 80.227];



  useEffect(() => {

    async function loadTreeModelStatus() {

      try {

        const response = await fetch(`${API}/api/tree-detection/status`);

        const data = await response.json();

        setTreeModelStatus(data);

      } catch (err) {

        setTreeModelStatus({

          available: false,

          status: 'backend_unreachable',

          message: 'Could not check the tree detection model status.',

        });

      }

    }



    loadTreeModelStatus();

  }, []);



  async function runTreeDetection() {

    if (!treeFile) {

      setTreeError('Choose a high-resolution forest image first.');

      return;

    }



    setTreeLoading(true);

    setTreeError('');

    setTreeResult(null);



    try {

      const formData = new FormData();

      formData.append('image', treeFile);



      const response = await fetch(`${API}/api/tree-detection`, {

        method: 'POST',

        body: formData,

      });



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data?.detail || 'Tree detection failed.');

      }



      setTreeResult(data);

    } catch (err) {

      setTreeError(err?.message || 'Could not run tree detection.');

    } finally {

      setTreeLoading(false);

    }

  }



  // ============================================================

  // AOI AREA

  // ============================================================



  const area = useMemo(() => {

    const hectares = result?.aoi?.area_hectares;



    if (hectares === undefined || hectares === null) {

      return '—';

    }



    return `${Number(hectares).toFixed(2)} ha`;

  }, [result]);



  // ============================================================

  // START DRAWING

  // ============================================================



  function selectLocation(locationId) {

    setSelectedLocationId(locationId);

    const location = forestLocations.find((item) => item.id === locationId);

    if (location) {

      setLocationSearch(location.name);

    }

    setPoints([]);

    setResult(null);

    setError('');

    setChangeResult(null);

    setChangeError('');

  }



  function start() {

    setPoints([]);

    setResult(null);

    setError('');

    setChangeResult(null);

    setChangeError('');

    setDrawing(true);

  }



  // ============================================================

  // ADD MAP POINT

  // ============================================================



  function addPoint(point) {

    setPoints((previous) => [...previous, point]);

    setResult(null);

    setError('');

    setChangeResult(null);

    setChangeError('');

  }



  // ============================================================

  // FINISH BOUNDARY

  // ============================================================



  function finish() {

    if (points.length < 3) {

      setError(

        'Add at least 3 points to create the forest boundary.'

      );

      return;

    }



    setDrawing(false);

    setError('');

  }



  // ============================================================

  // CLEAR

  // ============================================================



  function clear() {

    setPoints([]);

    setResult(null);

    setError('');

    setChangeResult(null);

    setChangeError('');

    setDrawing(false);

    setNdviMode(false);

  }



  // ============================================================

  // REAL EARTH ENGINE ANALYSIS

  // ============================================================



  async function analyze() {

    if (points.length < 3) {

      setError('Draw a forest boundary first.');

      return;

    }



    setLoading(true);

    setError('');

    setResult(null);



    try {

      const response = await fetch(`${API}/api/analyze`, {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          coordinates: points.map(([lat, lng]) => [lng, lat]),

          start_date: dateFrom,

          end_date: dateTo,

          max_cloud: Number(cloud),

          location_id: selectedLocation?.id || null,

          location_name: selectedLocation?.name || null,

          forest_type: selectedLocation?.forestType || null,

          tree_density_per_ha: selectedLocation?.densityTreesPerHa || null,

          avg_biomass_kg_per_tree: selectedLocation?.avgBiomassPerTreeKg || null,

        }),

      });



      const data = await response.json();



      console.log('SYLVASENSE EARTH ENGINE RESULT:', data);



      if (!response.ok) {

        throw new Error(

          data?.detail || 'Earth Engine analysis failed.'

        );

      }



      setResult(data);

    } catch (err) {

      console.error('Analysis error:', err);



      setError(

        err?.message ||

          'Could not connect to the SYLVASENSE backend.'

      );

    } finally {

      setLoading(false);

    }

  }



  // ============================================================

  // REAL FOREST CHANGE DETECTION

  // ============================================================



  async function detectChange() {

    if (points.length < 3) {

      setChangeError('Draw a forest boundary first.');

      return;

    }



    setChangeLoading(true);

    setChangeError('');

    setChangeResult(null);



    try {

      const response = await fetch(`${API}/api/change-detection`, {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          coordinates: points.map(([lat, lng]) => [lng, lat]),

          before_start: beforeFrom,

          before_end: beforeTo,

          after_start: afterFrom,

          after_end: afterTo,

          max_cloud: Number(cloud),

        }),

      });



      const data = await response.json();



      console.log('SYLVASENSE CHANGE DETECTION RESULT:', data);



      if (!response.ok) {

        throw new Error(

          data?.detail || 'Forest change detection failed.'

        );

      }



      setChangeResult(data);

      console.log('SYLVASENSE FOREST CHANGE: SUCCESS', data?.change);

    } catch (err) {

      console.error('Change detection error:', err);

      setChangeError(

        err?.message ||

          'Could not connect to the SYLVASENSE change detection service.'

      );

    } finally {

      setChangeLoading(false);

    }

  }



  // ============================================================

  // GEOJSON EXPORT

  // ============================================================



  function exportGeoJSON() {

    if (points.length < 3) {

      setError('Draw a forest boundary first.');

      return;

    }



    const ring = points.map(([lat, lng]) => [

      lng,

      lat,

    ]);



    // Close polygon

    ring.push(ring[0]);



    const geojson = {

      type: 'FeatureCollection',



      features: [

        {

          type: 'Feature',



          properties: {

            source: 'SYLVASENSE',

            satellite: 'Sentinel-1 + Sentinel-2',

          },



          geometry: {

            type: 'Polygon',

            coordinates: [ring],

          },

        },

      ],

    };



    const blob = new Blob(

      [JSON.stringify(geojson, null, 2)],

      {

        type: 'application/geo+json',

      }

    );



    const url = URL.createObjectURL(blob);



    const link = document.createElement('a');



    link.href = url;

    link.download = 'sylvasense-forest-aoi.geojson';



    document.body.appendChild(link);



    link.click();



    document.body.removeChild(link);



    URL.revokeObjectURL(url);

  }



  // ============================================================

  // BACKEND DATA

  // ============================================================



  const image = result?.image;

  const aoi = result?.aoi;

  const vegetation = result?.vegetation;

  const classification = result?.classification;

  const treeDetection = result?.tree_detection;

  const treeEstimation = result?.tree_estimation || result?.treeEstimation;

  const biomassCarbon = result?.biomass_carbon || result?.biomassCarbon;

  const imagery = result?.imagery;



  // ============================================================

  // BIOMASS & STORED CARBON CALCULATION

  // ============================================================

  // The satellite API may not return biomass values directly.

  // Calculate them from the AOI tree estimate and the selected

  // forest-location model so the dashboard never shows a blank

  // biomass/carbon value when the required assumptions exist.



  const aoiHectares = Number(aoi?.area_hectares || 0);



  const resultDensity = Number(

    treeEstimation?.density_trees_per_ha ??

    treeEstimation?.densityTreesPerHa ??

    0

  );



  const locationDensity = Number(

    selectedLocation?.densityTreesPerHa ??

    selectedLocation?.tree_density_per_ha ??

    0

  );



  const estimatedTreeCount = Number(

    treeEstimation?.estimated_tree_count ??

    treeEstimation?.estimatedTreeCount ??

    0

  );



  // Prefer the density supplied by the analysis. If it is missing,

  // use the selected forest location. If both are missing, derive

  // the density from the returned tree count and AOI area.

  const effectiveDensity =

    resultDensity > 0

      ? resultDensity

      : locationDensity > 0

      ? locationDensity

      : estimatedTreeCount > 0 && aoiHectares > 0

      ? estimatedTreeCount / aoiHectares

      : 0;



  const effectiveTreeCount =

    estimatedTreeCount > 0

      ? Math.round(estimatedTreeCount)

      : aoiHectares > 0 && effectiveDensity > 0

      ? Math.round(aoiHectares * effectiveDensity)

      : 0;



  const resultBiomassPerTree = Number(

    treeEstimation?.avg_biomass_per_tree_kg ??

    treeEstimation?.avg_biomass_kg_per_tree ??

    0

  );



  const locationBiomassPerTree = Number(

    selectedLocation?.avgBiomassPerTreeKg ??

    selectedLocation?.avg_biomass_kg_per_tree ??

    0

  );



  // 100 kg/tree is only a fallback display assumption when the

  // selected location does not contain a biomass value.

  const effectiveBiomassPerTree =

    resultBiomassPerTree > 0

      ? resultBiomassPerTree

      : locationBiomassPerTree > 0

      ? locationBiomassPerTree

      : 100;



  const calculatedBiomassTonnes =

    effectiveTreeCount > 0

      ? (effectiveTreeCount * effectiveBiomassPerTree) / 1000

      : null;



  const calculatedStoredCarbonTonnes =

    calculatedBiomassTonnes != null

      ? calculatedBiomassTonnes * 0.47

      : null;

  const sentinel1 = result?.sentinel1;



  const changeComparison = changeResult?.comparison;

  const changeS2 = changeResult?.sentinel2;

  const changeS1 = changeResult?.sentinel1;

  const changeStatus = changeResult?.change;

  const changeImagery = changeResult?.imagery;



  // ============================================================

  // UI

  // ============================================================



  return (

    <div className="app">



      <style>{`

        .app {

          background:

            radial-gradient(circle at 12% 8%, rgba(45, 190, 115, .10), transparent 28%),

            radial-gradient(circle at 88% 85%, rgba(15, 120, 78, .09), transparent 30%),

            #03100b;

          color: #eafff1;

        }

        .sectionDescription {

          margin: -7px 0 12px;

          color: rgba(207, 232, 216, .58);

          font-size: 10px;

          line-height: 1.55;

        }

        .panel.left, .panel.right {

          background: linear-gradient(180deg, rgba(4, 24, 15, .97), rgba(2, 15, 10, .98));

          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);

        }

        .topbar {

          background: linear-gradient(180deg, rgba(3, 18, 12, .98), rgba(3, 15, 10, .96));

          box-shadow: 0 10px 35px rgba(0,0,0,.18);

        }

      `}</style>



      {/* ======================================================

          TOP BAR

      ====================================================== */}



      <header className="topbar">



        <div className="brand">



          <div className="logo">

            🌲

          </div>



          <div>

            <h1>SYLVASENSE</h1>



            <p>

              REAL FOREST INTELLIGENCE

            </p>

          </div>



        </div>



        <div className="live">

          <i />

          EARTH ENGINE CONNECTED

        </div>



      </header>





      {/* ======================================================

          WORKSPACE

      ====================================================== */}



      <div className="workspace">





        {/* ====================================================

            LEFT PANEL

        ==================================================== */}



        <aside className="panel left">



          <div className="sectionTitle">

            LOCATION EXPLORER

          </div>



          <p className="sectionDescription">

            Search the forest intelligence database by name, country, region, or forest type.

          </p>



          <div className="locationExplorer" style={{ position: 'relative', marginBottom: '14px' }}>

            <div

              style={{

                display: 'flex',

                alignItems: 'center',

                gap: '8px',

                padding: '10px 12px',

                borderRadius: '12px',

                border: '1px solid rgba(68, 220, 139, 0.28)',

                background: 'linear-gradient(135deg, rgba(12, 34, 24, .98), rgba(5, 20, 14, .98))',

                boxShadow: '0 10px 30px rgba(0,0,0,.18)',

              }}

            >

              <span style={{ color: '#45df8b', fontSize: '18px' }}>⌕</span>

              <input

                type="text"

                value={locationSearch}

                onFocus={() => setShowLocationResults(true)}

                onChange={(e) => {

                  setLocationSearch(e.target.value);

                  setShowLocationResults(true);

                }}

                placeholder="Search forest, country or type..."

                style={{

                  width: '100%',

                  border: 'none',

                  outline: 'none',

                  background: 'transparent',

                  color: '#effff5',

                  fontSize: '13px',

                }}

              />

              {locationSearch && (

                <button

                  type="button"

                  onClick={() => {

                    setLocationSearch('');

                    setShowLocationResults(true);

                  }}

                  style={{

                    border: 'none',

                    background: 'transparent',

                    color: 'rgba(220,240,230,.65)',

                    cursor: 'pointer',

                    fontSize: '18px',

                  }}

                >

                  ×

                </button>

              )}

            </div>



            {showLocationResults && (

              <div

                style={{

                  position: 'absolute',

                  zIndex: 3000,

                  left: 0,

                  right: 0,

                  top: '58px',

                  maxHeight: '330px',

                  overflowY: 'auto',

                  padding: '6px',

                  borderRadius: '12px',

                  border: '1px solid rgba(68,220,139,.25)',

                  background: 'rgba(5,20,14,.99)',

                  boxShadow: '0 20px 50px rgba(0,0,0,.55)',

                }}

              >

                {filteredLocations.length > 0 ? (

                  filteredLocations.map((location) => (

                    <button

                      type="button"

                      key={location.id}

                      onClick={() => {

                        selectLocation(location.id);

                        setShowLocationResults(false);

                      }}

                      style={{

                        width: '100%',

                        display: 'flex',

                        alignItems: 'center',

                        gap: '10px',

                        padding: '10px',

                        marginBottom: '2px',

                        border: 'none',

                        borderRadius: '9px',

                        background: selectedLocationId === location.id ? 'rgba(60,220,130,.12)' : 'transparent',

                        color: '#effff5',

                        textAlign: 'left',

                        cursor: 'pointer',

                      }}

                    >

                      <span style={{ fontSize: '18px' }}>🌲</span>

                      <span style={{ minWidth: 0 }}>

                        <strong style={{ display: 'block', fontSize: '12px' }}>

                          {location.name}

                        </strong>

                        <small style={{ display: 'block', marginTop: '3px', color: 'rgba(210,235,220,.62)' }}>

                          {location.country}{location.region ? ` · ${location.region}` : ''}

                        </small>

                        <small style={{ display: 'block', marginTop: '2px', color: '#45df8b' }}>

                          {location.forestType}

                        </small>

                      </span>

                    </button>

                  ))

                ) : (

                  <div style={{ padding: '18px', textAlign: 'center', color: 'rgba(220,240,230,.55)', fontSize: '12px' }}>

                    No matching forest locations found.

                  </div>

                )}

              </div>

            )}

          </div>



          {selectedLocation && (

            <div

              className="note"

              style={{

                marginBottom: '14px',

                border: '1px solid rgba(70,220,135,.22)',

                background: 'linear-gradient(135deg, rgba(35,110,72,.14), rgba(5,20,14,.65))',

                borderRadius: '12px',

                padding: '13px',

              }}

            >

              <span style={{ color: '#45df8b', fontSize: '9px', letterSpacing: '1.3px', fontWeight: 700 }}>

                SELECTED FOREST

              </span>

              <b style={{ display: 'block', marginTop: '4px', fontSize: '14px' }}>

                {selectedLocation.name}

              </b>

              <p style={{ marginBottom: 0, marginTop: '6px', lineHeight: 1.5 }}>

                {selectedLocation.country} · {selectedLocation.forestType}

                <br />

                Estimated density: {selectedLocation.densityTreesPerHa} trees/ha

                <br />

                Biomass assumption: {selectedLocation.avgBiomassPerTreeKg} kg/tree

              </p>

            </div>

          )}



          <div className="sectionTitle">

            AREA OF INTEREST

          </div>





          <div className="hint">



            <b>

              {drawing

                ? 'DRAWING MODE'

                : points.length >= 3

                ? 'FOREST AREA SELECTED'

                : 'SELECT FOREST AREA'}

            </b>



            <span>

              {drawing

                ? 'Click the satellite map to place boundary points.'

                : points.length >= 3

                ? `${points.length} boundary points selected. Ready for satellite analysis.`

                : 'Draw a polygon around the forest you want to analyze.'}

            </span>



          </div>





          <div className="btnrow">



            {drawing ? (



              <button

                className="primary"

                onClick={finish}

              >

                ✓ FINISH BOUNDARY

              </button>



            ) : (



              <button

                className="primary"

                onClick={start}

              >

                ＋ DRAW FOREST BOUNDARY

              </button>



            )}



            <button

              className="secondary small"

              onClick={clear}

            >

              CLEAR

            </button>



          </div>





          {/* ==================================================

              SENTINEL SEARCH

          ================================================== */}



          <div className="sectionTitle">

            SENTINEL-2 SEARCH

          </div>





          <label>

            FROM



            <input

              type="date"

              value={dateFrom}

              onChange={(e) =>

                setDateFrom(e.target.value)

              }

            />

          </label>





          <label>

            TO



            <input

              type="date"

              value={dateTo}

              onChange={(e) =>

                setDateTo(e.target.value)

              }

            />

          </label>





          <label>



            MAX CLOUD COVER — {cloud}%



            <input

              type="range"

              min="1"

              max="80"

              value={cloud}

              onChange={(e) =>

                setCloud(e.target.value)

              }

            />



          </label>





          {/* ==================================================

              FOREST CHANGE DETECTION

          ================================================== */}



          <div className="sectionTitle">

            FOREST CHANGE

          </div>



          <label>

            BEFORE — FROM

            <input

              type="date"

              value={beforeFrom}

              onChange={(e) => setBeforeFrom(e.target.value)}

            />

          </label>



          <label>

            BEFORE — TO

            <input

              type="date"

              value={beforeTo}

              onChange={(e) => setBeforeTo(e.target.value)}

            />

          </label>



          <label>

            AFTER — FROM

            <input

              type="date"

              value={afterFrom}

              onChange={(e) => setAfterFrom(e.target.value)}

            />

          </label>



          <label>

            AFTER — TO

            <input

              type="date"

              value={afterTo}

              onChange={(e) => setAfterTo(e.target.value)}

            />

          </label>



          <button

            className="secondary"

            disabled={changeLoading || points.length < 3}

            onClick={detectChange}

          >

            {changeLoading

              ? 'DETECTING FOREST CHANGE…'

              : 'DETECT FOREST CHANGE'}

            <b>→</b>

          </button>



          {changeError && (

            <div className="error">

              {changeError}

            </div>

          )}



          {/* ==================================================

              ANALYSIS

          ================================================== */}



          <div className="sectionTitle">

            ANALYSIS

          </div>





          <button

            className="analyze"

            disabled={

              loading ||

              points.length < 3

            }

            onClick={analyze}

          >



            {loading

              ? 'ANALYZING REAL IMAGERY…'

              : 'RUN REAL SATELLITE ANALYSIS'}



            <b>→</b>



          </button>





          <button

            className="secondary"

            onClick={exportGeoJSON}

          >

            ↓ EXPORT GEOJSON

          </button>





          {error && (

            <div className="error">

              {error}

            </div>

          )}





          {/* ==================================================

              REAL DATA NOTE

          ================================================== */}



          <div className="note">



            <b>

              REAL SATELLITE DATA MODE

            </b>



            <p>
              Analysis uses Google Earth Engine with Sentinel-2 optical
              imagery and Sentinel-1 SAR data. Tree counts, biomass,
              and carbon values are model-based estimates derived from
              the selected AOI and forest-density assumptions.
              High-resolution AI tree detection is available as a
              separate experimental module.
            </p>



          </div>



        </aside>





        {/* ====================================================

            MAP

        ==================================================== */}



        <main className="mapArea">



          <MapContainer

            center={center}

            zoom={13}

            className="map"

          >



            <TileLayer

              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

              attribution="Satellite imagery © Esri"

            />



            <MapLocationController location={selectedLocation} />



            <MapClicks

              drawing={drawing}

              onPoint={addPoint}

            />



            {selectedLocation && (

              <CircleMarker

                center={[selectedLocation.lat, selectedLocation.lng]}

                radius={9}

                pathOptions={{

                  color: '#ffffff',

                  fillColor: '#ffd166',

                  fillOpacity: 0.95,

                  weight: 3,

                }}

              />

            )}





            {/* POINTS */}



            {points.map((point, index) => (



              <CircleMarker

                key={index}

                center={point}

                radius={5}

                pathOptions={{

                  color: '#ffffff',

                  fillColor: '#48e17c',

                  fillOpacity: 1,

                  weight: 2,

                }}

              />



            ))}





            {/* POLYGON */}



            {points.length >= 2 && (



              <Polygon

                positions={points}

                pathOptions={{

                  color: '#43df79',

                  fillColor: '#43df79',

                  fillOpacity: 0.2,

                  weight: 3,

                }}

              />



            )}



          </MapContainer>





          {/* MAP BADGE */}



          <div className="mapBadge">

            <i />

            LIVE SATELLITE BASEMAP

          </div>





          {/* DRAW BADGE */}



          {drawing && (



            <div className="drawBadge">

              DRAW AOI · {points.length} POINTS

            </div>



          )}





          {/* ==================================================

              SATELLITE THUMBNAIL

          ================================================== */}



          {imagery && (



            <div className="imagery">



              <div>



                <button

                  className={

                    !ndviMode

                      ? 'active'

                      : ''

                  }

                  onClick={() =>

                    setNdviMode(false)

                  }

                >

                  TRUE COLOR

                </button>





                <button

                  className={

                    ndviMode

                      ? 'active'

                      : ''

                  }

                  onClick={() =>

                    setNdviMode(true)

                  }

                >

                  NDVI

                </button>



              </div>





              <img

                src={

                  ndviMode

                    ? imagery.ndvi_thumbnail

                    : imagery.true_color_thumbnail

                }

                alt="Satellite analysis"

                onError={(e) => {

                  e.currentTarget.style.display =

                    'none';

                }}

              />



            </div>



          )}



        </main>





        {/* ====================================================

            RIGHT PANEL

        ==================================================== */}



        <aside className="panel right">



          <div className="rhead">



            <div>



              <small>

                AI / SATELLITE ANALYSIS

              </small>



              <h2>

                Forest Intelligence

              </h2>



            </div>



            <b>

              S1 + S2

            </b>



          </div>



          {/* ==================================================

              FOREST CHANGE STATUS

          ================================================== */}



          {changeLoading && (

            <div

              style={{

                marginTop: '12px',

                padding: '14px',

                border: '1px solid rgba(67, 223, 121, 0.25)',

                borderRadius: '12px',

                background: 'rgba(4, 20, 13, 0.78)',

              }}

            >

              <b style={{ display: 'block', marginBottom: '6px' }}>

                ANALYZING FOREST CHANGE

              </b>

              <span style={{ fontSize: '12px', opacity: 0.75 }}>

                Comparing Sentinel-2 NDVI and Sentinel-1 radar data…

              </span>

            </div>

          )}



          {changeError && (

            <div

              style={{

                marginTop: '12px',

                padding: '12px',

                border: '1px solid rgba(255, 90, 90, 0.45)',

                borderRadius: '12px',

                background: 'rgba(60, 10, 10, 0.55)',

                color: '#ffb0b0',

                fontSize: '12px',

              }}

            >

              <b>FOREST CHANGE ERROR</b>

              <div style={{ marginTop: '6px' }}>{changeError}</div>

            </div>

          )}



          {/* ==================================================

              FOREST CHANGE RESULTS

          ================================================== */}



          {changeResult && (

            <div className="changeResults">



              <div className="card">

                <span>FOREST CHANGE DETECTION</span>

                <strong>

                  {changeStatus?.status || '—'}

                </strong>

                <p>

                  {changeStatus?.method ||

                    'Sentinel-2 temporal comparison with Sentinel-1 radar change.'}

                </p>

              </div>



              <div className="source">

                <div>

                  <span>BEFORE</span>

                  <b>

                    {changeComparison?.before_period?.selected_date || '—'}

                  </b>

                </div>



                <div>

                  <span>AFTER</span>

                  <b>

                    {changeComparison?.after_period?.selected_date || '—'}

                  </b>

                </div>

              </div>



              <div className="grid">

                <Stat

                  label="NDVI BEFORE"

                  value={

                    changeS2?.ndvi_before != null

                      ? Number(changeS2.ndvi_before).toFixed(4)

                      : '—'

                  }

                />



                <Stat

                  label="NDVI AFTER"

                  value={

                    changeS2?.ndvi_after != null

                      ? Number(changeS2.ndvi_after).toFixed(4)

                      : '—'

                  }

                />



                <Stat

                  label="NDVI CHANGE"

                  value={

                    changeS2?.ndvi_change != null

                      ? Number(changeS2.ndvi_change).toFixed(4)

                      : '—'

                  }

                />



                <Stat

                  label="VV CHANGE"

                  value={

                    changeS1?.vv_change_db != null

                      ? `${Number(changeS1.vv_change_db).toFixed(2)} dB`

                      : '—'

                  }

                />

              </div>



              <div className="source">

                <div>

                  <span>S1 BEFORE IMAGES</span>

                  <b>{changeS1?.before_images ?? '—'}</b>

                </div>



                <div>

                  <span>S1 AFTER IMAGES</span>

                  <b>{changeS1?.after_images ?? '—'}</b>

                </div>

              </div>



              {changeImagery?.ndvi_change_thumbnail && (

                <div

                  className="changeMapCard"

                  style={{

                    marginTop: '14px',

                    padding: '12px',

                    border: '1px solid rgba(67, 223, 121, 0.22)',

                    borderRadius: '12px',

                    background: 'rgba(4, 20, 13, 0.72)',

                    overflow: 'hidden',

                  }}

                >

                  <span

                    style={{

                      display: 'block',

                      marginBottom: '10px',

                      fontSize: '10px',

                      letterSpacing: '1.5px',

                      fontWeight: 700,

                      color: '#8ee8aa',

                    }}

                  >

                    NDVI CHANGE MAP

                  </span>



                  <img

                    src={changeImagery.ndvi_change_thumbnail}

                    alt="Forest change detection map"

                    style={{

                      display: 'block',

                      width: '100%',

                      height: '220px',

                      objectFit: 'cover',

                      borderRadius: '8px',

                      background: '#08120d',

                    }}

                    onError={(e) => {

                      e.currentTarget.style.display = 'none';

                    }}

                  />

                </div>

              )}



              {changeStatus?.note && (

                <div className="note">

                  <b>CHANGE SCREENING NOTE</b>

                  <p>{changeStatus.note}</p>

                </div>

              )}



            </div>

          )}









          {/* ==================================================

              BEFORE ANALYSIS

          ================================================== */}



          {!result && !loading && (



            <div className="empty">



              <div>

                🌍

              </div>



              <h3>

                Ready for Real Analysis

              </h3>



              <p>

                Draw an area on the satellite

                map and run the analysis.

              </p>



              <div className="steps">



                <span>

                  01 — Draw AOI

                </span>



                <span>

                  02 — Find Sentinel-2 imagery

                </span>



                <span>

                  03 — Calculate NDVI

                </span>



                <span>

                  04 — Measure vegetation

                </span>



              </div>



            </div>



          )}





          {/* ==================================================

              LOADING

          ================================================== */}



          {loading && (



            <div className="empty">



              <div className="spinner" />



              <h3>

                Processing Earth Engine

              </h3>



              <p>

                Searching Sentinel-2 optical imagery

                and Sentinel-1 radar data, filtering

                imagery and calculating vegetation metrics.

              </p>



            </div>



          )}





          {/* ==================================================

              RESULTS

          ================================================== */}



          {result && (



            <>



              {/* ----------------------------------------------

                  SELECTED IMAGE

              ---------------------------------------------- */}



              <div className="source">



                <div>



                  <span>

                    SELECTED IMAGE

                  </span>



                  <b>

                    {image?.date || '—'}

                  </b>



                </div>





                <div>



                  <span>

                    CLOUD COVER

                  </span>



                  <b>

                    {image?.cloud_cover != null

                      ? Number(

                          image.cloud_cover

                        ).toFixed(4)

                      : '—'}

                    %

                  </b>



                </div>



              </div>





              {/* ----------------------------------------------

                  MAIN STATISTICS

              ---------------------------------------------- */}



              <div className="grid">



                <Stat

                  label="AOI AREA"

                  value={area}

                />



                <Stat

                  label="LOCATION"

                  value={selectedLocation?.name || treeEstimation?.location_name || '—'}

                />



                <Stat

                  label="VEGETATION"

                  value={

                    vegetation?.vegetation_percentage != null

                      ? `${Number(

                          vegetation.vegetation_percentage

                        ).toFixed(2)}%`

                      : '—'

                  }

                />





                <Stat

                  label="MEAN NDVI"

                  value={

                    vegetation?.mean_ndvi != null

                      ? Number(

                          vegetation.mean_ndvi

                        ).toFixed(4)

                      : '—'

                  }

                />





                <Stat

                  label="IMAGES FOUND"

                  value={

                    image?.images_found ??

                    '—'

                  }

                />



              </div>







              {/* ----------------------------------------------

                  SENTINEL-1 SAR

              ---------------------------------------------- */}



              <div className="card">

                <span>SENTINEL-1 SAR</span>



                <div className="grid">

                  <Stat

                    label="IMAGES FOUND"

                    value={sentinel1?.available ? sentinel1.images_found : '—'}

                  />



                  <Stat

                    label="SELECTED DATE"

                    value={sentinel1?.selected_date || '—'}

                  />



                  <Stat

                    label="MEAN VV"

                    value={sentinel1?.mean_vv_db != null

                      ? `${Number(sentinel1.mean_vv_db).toFixed(2)} dB`

                      : '—'}

                  />



                  <Stat

                    label="MEAN VH"

                    value={sentinel1?.mean_vh_db != null

                      ? `${Number(sentinel1.mean_vh_db).toFixed(2)} dB`

                      : '—'}

                  />

                </div>



                <div className="source">

                  <div>

                    <span>VV − VH</span>

                    <b>

                      {sentinel1?.vv_minus_vh_db != null

                        ? `${Number(sentinel1.vv_minus_vh_db).toFixed(2)} dB`

                        : '—'}

                    </b>

                  </div>



                  <div>

                    <span>MODE</span>

                    <b>IW SAR</b>

                  </div>

                </div>



                <p>

                  {sentinel1?.available

                    ? 'Real Sentinel-1 GRD radar screening using VV and VH polarization.'

                    : 'No suitable Sentinel-1 VV/VH imagery was found for this AOI and date range.'}

                </p>

              </div>





              {/* ----------------------------------------------

                  VEGETATION AREA

              ---------------------------------------------- */}



              <div className="card">



                <span>

                  VEGETATION AREA

                </span>



                <strong>



                  {vegetation?.vegetation_area_hectares != null

                    ? Number(

                        vegetation.vegetation_area_hectares

                      ).toFixed(3)

                    : '—'}



                  <small>

                    {' '}ha

                  </small>



                </strong>





                <div className="bar">



                  <i

                    style={{

                      width: `${Math.min(

                        100,

                        Number(

                          vegetation?.vegetation_percentage ||

                          0

                        )

                      )}%`,

                    }}

                  />



                </div>



              </div>





              {/* ----------------------------------------------

                  CLASSIFICATION

              ---------------------------------------------- */}



              <div className="card">



                <span>

                  FOREST CLASSIFICATION

                </span>



                <strong>

                  {classification?.type ||

                    '—'}

                </strong>



                <p>

                  {classification?.status ||

                    'Based on Sentinel-2 NDVI spectral screening.'}

                </p>



              </div>





              {/* ----------------------------------------------

                  AI TREE DETECTION

              ---------------------------------------------- */}



              <div className="tree" style={{ marginBottom: '12px' }}>



                <span>AI TREE DETECTION</span>



                <strong style={{ display: 'block', marginTop: '6px' }}>

                  {treeModelStatus?.available ? 'MODEL READY' : 'MODEL NOT INSTALLED'}

                </strong>



                <p>

                  {treeModelStatus?.message ||

                    'Upload a high-resolution forest image to run the experimental DeepForest V2 individual-tree detector.'}

                </p>



                <input

                  type="file"

                  accept="image/png,image/jpeg,image/jpg,image/tif,image/tiff"

                  onChange={(e) => {

                    setTreeFile(e.target.files?.[0] || null);

                    setTreeResult(null);

                    setTreeError('');

                  }}

                  style={{ width: '100%', marginTop: '8px' }}

                />



                {treeFile && (

                  <small style={{ display: 'block', marginTop: '6px' }}>

                    Selected: {treeFile.name}

                  </small>

                )}



                <button

                  className="primary"

                  type="button"

                  onClick={runTreeDetection}

                  disabled={treeLoading || !treeFile}

                  style={{ width: '100%', marginTop: '10px' }}

                >

                  {treeLoading ? 'RUNNING TREE DETECTION…' : 'RUN TREE DETECTION'}

                </button>



                {treeError && (

                  <div className="error" style={{ marginTop: '8px' }}>

                    {treeError}

                  </div>

                )}



                {treeResult && (

                  <div className="card" style={{ marginTop: '10px' }}>

                    <span>TREE DETECTION RESULT</span>

                    <strong>{treeResult.tree_count ?? '—'} trees</strong>

                    <p>{treeResult.message || 'Tree detections generated.'}</p>

                  </div>

                )}



              </div>



              {/* ----------------------------------------------

                  SATELLITE SCREENING TREE STATUS

              ---------------------------------------------- */}



              <div className="tree">

                <span>MODEL-ESTIMATED TREE COUNT</span>



                <strong

                  style={{

                    display: 'block',

                    marginTop: '6px',

                    fontSize: '28px',

                    color: '#e4d65b',

                  }}

                >

                  {effectiveTreeCount > 0

                    ? `${effectiveTreeCount.toLocaleString()} TREES`

                    : '—'}

                </strong>



                <p>

                  {effectiveTreeCount > 0

                    ? `${Math.round(effectiveDensity).toLocaleString()} trees/ha × ${aoiHectares.toFixed(2)} ha`

                    : selectedLocation

                    ? 'Draw the AOI and run real satellite analysis to estimate tree count.'

                    : 'Select a forest location, draw the AOI, and run analysis.'}

                </p>



                {selectedLocation && (

                  <small>

                    {selectedLocation.forestType}

                    <br />

                    Model density: {Number(selectedLocation.densityTreesPerHa || 0).toLocaleString()} trees/ha

                    <br />

                    Biomass assumption: {Number(effectiveBiomassPerTree).toLocaleString()} kg/tree

                  </small>

                )}



                {treeEstimation?.method && (

                  <small style={{ display: 'block', marginTop: '5px' }}>

                    {treeEstimation.method}

                  </small>

                )}

              </div>



              <div className="card">

                <span>BIOMASS & STORED CARBON</span>



                <div className="grid">

                  <Stat

                    label="BIOMASS"

                    value={

                      calculatedBiomassTonnes != null

                        ? `${calculatedBiomassTonnes.toLocaleString(undefined, {

                            minimumFractionDigits: 2,

                            maximumFractionDigits: 2,

                          })} t`

                        : biomassCarbon?.above_ground_biomass_tonnes != null

                        ? `${Number(biomassCarbon.above_ground_biomass_tonnes).toFixed(2)} t`

                        : '—'

                    }

                  />



                  <Stat

                    label="STORED CARBON"

                    value={

                      calculatedStoredCarbonTonnes != null

                        ? `${calculatedStoredCarbonTonnes.toLocaleString(undefined, {

                            minimumFractionDigits: 2,

                            maximumFractionDigits: 2,

                          })} t C`

                        : biomassCarbon?.stored_carbon_tonnes_c != null

                        ? `${Number(biomassCarbon.stored_carbon_tonnes_c).toFixed(2)} t C`

                        : '—'

                    }

                  />

                </div>



                <p>

                  Estimated from the selected forest area and tree-density model.

                  <br />

                  Biomass = Estimated Trees × Average Biomass per Tree.

                  <br />

                  Stored Carbon = Biomass × 0.47.

                </p>



                <small>

                  {Number(effectiveBiomassPerTree).toLocaleString()} kg biomass/tree assumption

                </small>

              </div>





              {/* ----------------------------------------------

                  PIPELINE

              ---------------------------------------------- */}



              <div className="pipeline">



                <span>

                  REAL PIPELINE

                </span>



                <div>

                  ✓ Earth Engine authenticated

                </div>



                <div>

                  ✓ Sentinel-2 imagery found

                </div>



                <div>

                  ✓ Sentinel-1 VV/VH radar checked

                </div>



                <div>

                  ✓ Cloud filtering applied

                </div>



                <div>

                  ✓ AOI area calculated

                </div>



                <div>

                  ✓ NDVI calculated

                </div>



                <div>

                  ✓ Vegetation area calculated

                </div>



              </div>





              {/* ----------------------------------------------

                  RAW SOURCE

              ---------------------------------------------- */}



              <div className="source">



                <div>



                  <span>

                    LOCATION

                  </span>



                  <b>

                    {selectedLocation?.name || treeEstimation?.location_name || 'Custom AOI'}

                  </b>



                </div>





                <div>



                  <span>

                    SOURCE

                  </span>



                  <b>

                    Google Earth Engine

                  </b>



                </div>



              </div>



            </>



          )}



        </aside>



      </div>



    </div>

  );

}