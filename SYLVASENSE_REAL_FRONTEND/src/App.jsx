import React, { useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  useMapEvents
} from 'react-leaflet';

import 'leaflet/dist/leaflet.css';

const API = 'http://127.0.0.1:8000';


// ============================================================
// MAP CLICK HANDLER
// ============================================================

function MapClicks({ drawing, onPoint }) {
  useMapEvents({
    click(e) {
      if (drawing) {
        onPoint([e.latlng.lat, e.latlng.lng]);
      }
    }
  });

  return null;
}


// ============================================================
// STAT CARD
// ============================================================

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  );
}


// ============================================================
// MAIN APPLICATION
// ============================================================

export default function App() {

  // ----------------------------------------------------------
  // AOI STATE
  // ----------------------------------------------------------

  const [points, setPoints] = useState([]);

  // User is currently clicking points
  const [drawing, setDrawing] = useState(false);

  // Polygon has been completed
  const [aoiSelected, setAoiSelected] = useState(false);


  // ----------------------------------------------------------
  // ANALYSIS STATE
  // ----------------------------------------------------------

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');


  // ----------------------------------------------------------
  // SENTINEL-2 SEARCH SETTINGS
  // ----------------------------------------------------------

  const [dateFrom, setDateFrom] = useState('2025-01-01');
  const [dateTo, setDateTo] = useState('2026-09-23');
  const [cloud, setCloud] = useState(20);


  // ----------------------------------------------------------
  // NDVI IMAGE MODE
  // ----------------------------------------------------------

  const [ndviMode, setNdviMode] = useState(false);


  // ----------------------------------------------------------
  // DEFAULT MAP LOCATION
  // ----------------------------------------------------------

  const center = [12.842, 80.227];


  // ----------------------------------------------------------
  // AREA DISPLAY
  // ----------------------------------------------------------

  const area = useMemo(() => {

    if (
      result?.area?.hectares !== undefined &&
      result?.area?.hectares !== null
    ) {
      const value = Number(result.area.hectares);

      if (Number.isFinite(value)) {
        return `${value.toFixed(2)} ha`;
      }
    }

    return '—';

  }, [result]);


  // ==========================================================
  // START DRAWING
  // ==========================================================

  function start() {

    setPoints([]);

    setResult(null);

    setError('');

    setAoiSelected(false);

    setDrawing(true);
  }


  // ==========================================================
  // ADD MAP POINT
  // ==========================================================

  function addPoint(point) {

    setPoints(previous => [
      ...previous,
      point
    ]);

    setResult(null);

    setError('');

    // If user starts adding points again,
    // AOI becomes unconfirmed.
    setAoiSelected(false);
  }


  // ==========================================================
  // FINISH AOI
  // ==========================================================

  function finish() {

    if (points.length < 3) {

      setError(
        'Add at least 3 points to create the forest boundary.'
      );

      return;
    }


    // STOP DRAWING
    setDrawing(false);


    // IMPORTANT:
    // Remember that the polygon has been completed.
    setAoiSelected(true);


    setError('');
  }


  // ==========================================================
  // CLEAR AOI
  // ==========================================================

  function clear() {

    setPoints([]);

    setResult(null);

    setError('');

    setDrawing(false);

    setAoiSelected(false);
  }


  // ==========================================================
  // ANALYZE SATELLITE DATA
  // ==========================================================

  async function analyze() {

    if (points.length < 3) {

      setError(
        'Draw a forest boundary first.'
      );

      return;
    }


    if (!aoiSelected) {

      setError(
        'Finish the forest boundary before starting analysis.'
      );

      return;
    }


    setLoading(true);

    setError('');

    setResult(null);


    try {

      // Convert:
      //
      // [latitude, longitude]
      //
      // to:
      //
      // [longitude, latitude]
      //
      // GeoJSON format

      const coordinates = points.map(
        ([lat, lng]) => [lng, lat]
      );


      const response = await fetch(
        `${API}/api/analyze`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({

            coordinates,

            start_date: dateFrom,

            end_date: dateTo,

            max_cloud: Number(cloud)

          })
        }
      );


      const data = await response.json();


      if (!response.ok) {

        throw new Error(
          data.detail || 'Analysis failed'
        );
      }


      setResult(data);

    }

    catch (e) {

      console.error(e);

      setError(
        e.message ||
        'Could not connect to backend'
      );

    }

    finally {

      setLoading(false);
    }
  }


  // ==========================================================
  // EXPORT GEOJSON
  // ==========================================================

  function exportGeoJSON() {

    if (points.length < 3) {

      setError(
        'Draw a forest boundary first.'
      );

      return;
    }


    const ring = points.map(
      ([lat, lng]) => [lng, lat]
    );


    // Close polygon
    ring.push(ring[0]);


    const geojson = {

      type: 'FeatureCollection',

      features: [

        {

          type: 'Feature',

          properties: {

            source: 'SYLVASENSE',

            generated_at:
              new Date().toISOString()

          },

          geometry: {

            type: 'Polygon',

            coordinates: [
              ring
            ]

          }

        }

      ]

    };


    const blob = new Blob(
      [
        JSON.stringify(
          geojson,
          null,
          2
        )
      ],
      {
        type: 'application/geo+json'
      }
    );


    const url =
      URL.createObjectURL(blob);


    const link =
      document.createElement('a');


    link.href = url;

    link.download =
      'sylvasense-forest-aoi.geojson';


    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);


    URL.revokeObjectURL(url);
  }


  // ==========================================================
  // RESULT DATA
  // ==========================================================

  const dataSource =
    result?.data_source;

  const vegetation =
    result?.vegetation;

  const ndvi =
    result?.ndvi;

  const imagery =
    result?.imagery;


  // ==========================================================
  // UI
  // ==========================================================

  return (

    <div className="app">


      {/* ======================================================
          TOP BAR
      ====================================================== */}

      <header className="topbar">

        <div className="brand">

          <div className="logo">
            🌲
          </div>

          <div>

            <h1>
              SYLVASENSE
            </h1>

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
            AREA OF INTEREST
          </div>


          {/* -----------------------------------------------
              AOI STATUS
          ------------------------------------------------ */}

          <div className="hint">

            <b>

              {drawing
                ? 'DRAWING MODE'
                : aoiSelected
                  ? 'FOREST AREA SELECTED'
                  : 'SELECT FOREST AREA'
              }

            </b>


            <span>

              {drawing

                ? 'Click the satellite map to place boundary points.'

                : aoiSelected

                  ? `${points.length} boundary points selected. Ready for satellite analysis.`

                  : 'Draw a polygon around the forest you want to analyze.'

              }

            </span>

          </div>



          {/* -----------------------------------------------
              AOI BUTTONS
          ------------------------------------------------ */}

          <div className="btnrow">


            {drawing ? (

              <button
                className="primary"
                onClick={finish}
              >
                ✓ FINISH BOUNDARY
              </button>

            ) : aoiSelected ? (

              <button
                className="primary"
                onClick={start}
              >
                ✎ REDRAW BOUNDARY
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



          {/* =================================================
              SENTINEL-2 SEARCH
          ================================================= */}

          <div className="sectionTitle">
            SENTINEL-2 SEARCH
          </div>


          <label>

            FROM

            <input
              type="date"
              value={dateFrom}
              onChange={
                e =>
                  setDateFrom(e.target.value)
              }
            />

          </label>


          <label>

            TO

            <input
              type="date"
              value={dateTo}
              onChange={
                e =>
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
              onChange={
                e =>
                  setCloud(e.target.value)
              }
            />

          </label>



          {/* =================================================
              ANALYSIS
          ================================================= */}

          <div className="sectionTitle">
            ANALYSIS
          </div>


          <button
            className="analyze"
            disabled={
              loading ||
              points.length < 3 ||
              !aoiSelected
            }
            onClick={analyze}
          >

            {loading
              ? 'ANALYZING REAL IMAGERY…'
              : 'RUN REAL SATELLITE ANALYSIS'
            }

            <b>
              →
            </b>

          </button>


          <button
            className="secondary"
            onClick={exportGeoJSON}
          >
            ↓ EXPORT GEOJSON
          </button>


          {/* =================================================
              ERROR
          ================================================= */}

          {error && (

            <div className="error">
              {error}
            </div>

          )}



          {/* =================================================
              REAL DATA NOTE
          ================================================= */}

          <div className="note">

            <b>
              REAL DATA MODE
            </b>

            <p>

              Results are calculated from
              Earth Engine Sentinel-2 imagery.
              Individual tree count is not
              fabricated when suitable
              high-resolution imagery and a
              trained model are unavailable.

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


            {/* Satellite basemap */}

            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Satellite imagery © Esri"
            />


            {/* Map click handler */}

            <MapClicks
              drawing={drawing}
              onPoint={addPoint}
            />


            {/* Boundary points */}

            {points.map(
              (point, index) => (

                <CircleMarker
                  key={index}
                  center={point}
                  radius={5}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: '#48e17c',
                    fillOpacity: 1,
                    weight: 2
                  }}
                />

              )
            )}


            {/* Polygon */}

            {points.length >= 2 && (

              <Polygon
                positions={points}
                pathOptions={{
                  color: '#43df79',
                  fillColor: '#43df79',
                  fillOpacity: 0.2,
                  weight: 3
                }}
              />

            )}


          </MapContainer>



          {/* =================================================
              MAP BADGE
          ================================================= */}

          <div className="mapBadge">

            <i />

            LIVE SATELLITE BASEMAP

          </div>



          {/* =================================================
              DRAWING BADGE
          ================================================= */}

          {drawing && (

            <div className="drawBadge">

              DRAW AOI · {points.length} POINTS

            </div>

          )}



          {/* =================================================
              AOI SELECTED BADGE
          ================================================= */}

          {aoiSelected && !drawing && (

            <div className="drawBadge">

              ✓ AOI SELECTED · {points.length} POINTS

            </div>

          )}



          {/* =================================================
              IMAGERY PREVIEW
          ================================================= */}

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
                    : imagery.rgb_thumbnail
                }
                alt="Satellite analysis"
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
              S2
            </b>

          </div>



          {/* =================================================
              EMPTY STATE
          ================================================= */}

          {!result && !loading && (

            <div className="empty">

              <div>
                🌍
              </div>

              <h3>

                {aoiSelected
                  ? 'AOI Ready for Analysis'
                  : 'Ready for Real Analysis'
                }

              </h3>


              <p>

                {aoiSelected
                  ? 'Your forest boundary is ready. Run the satellite analysis.'
                  : 'Draw an area on the satellite map and run the analysis.'
                }

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



          {/* =================================================
              LOADING STATE
          ================================================= */}

          {loading && (

            <div className="empty">

              <div className="spinner" />

              <h3>
                Processing Earth Engine
              </h3>

              <p>

                Searching imagery,
                filtering clouds and
                calculating vegetation metrics.

              </p>

            </div>

          )}



          {/* =================================================
              RESULTS
          ================================================= */}

          {result && (

            <>

              {/* ---------------------------------------------
                  SOURCE
              --------------------------------------------- */}

              <div className="source">


                <div>

                  <span>
                    SELECTED IMAGE
                  </span>

                  <b>
                    {dataSource?.acquisition_date || '—'}
                  </b>

                </div>


                <div>

                  <span>
                    CLOUD COVER
                  </span>

                  <b>

                    {dataSource?.cloud_percentage !==
                    undefined

                      ? Number(
                          dataSource.cloud_percentage
                        ).toFixed(3) + '%'

                      : '—'

                    }

                  </b>

                </div>


              </div>



              {/* ---------------------------------------------
                  METRIC GRID
              --------------------------------------------- */}

              <div className="grid">


                <Stat
                  label="AOI AREA"
                  value={area}
                />


                <Stat
                  label="VEGETATION"
                  value={
                    vegetation &&
                    Number.isFinite(
                      Number(
                        vegetation.coverage_percent
                      )
                    )

                      ? `${Number(
                          vegetation.coverage_percent
                        ).toFixed(1)}%`

                      : '—'
                  }
                />


                <Stat
                  label="MEAN NDVI"
                  value={
                    ndvi?.mean !== null &&
                    ndvi?.mean !== undefined &&
                    Number.isFinite(
                      Number(ndvi.mean)
                    )

                      ? Number(
                          ndvi.mean
                        ).toFixed(3)

                      : '—'
                  }
                />


                <Stat
                  label="IMAGES FOUND"
                  value={
                    dataSource?.image_count ??
                    '—'
                  }
                />


              </div>



              {/* ---------------------------------------------
                  VEGETATION AREA
              --------------------------------------------- */}

              <div className="card">

                <span>
                  VEGETATION AREA
                </span>


                <strong>

                  {vegetation &&
                  Number.isFinite(
                    Number(
                      vegetation.area_hectares
                    )
                  )

                    ? Number(
                        vegetation.area_hectares
                      ).toFixed(3)

                    : '—'
                  }

                  <small>
                    ha
                  </small>

                </strong>


                <div className="bar">

                  <i
                    style={{
                      width:
                        `${Math.min(
                          100,
                          Number(
                            vegetation?.coverage_percent || 0
                          )
                        )}%`
                    }}
                  />

                </div>

              </div>



              {/* ---------------------------------------------
                  FOREST CLASSIFICATION
              --------------------------------------------- */}

              <div className="card">

                <span>
                  FOREST CLASSIFICATION
                </span>


                <strong>

                  {result?.forest?.classification ||
                    '—'}

                </strong>


                <p>
                  Based on mean NDVI within
                  the selected AOI.
                </p>

              </div>



              {/* ---------------------------------------------
                  TREE COUNT
              --------------------------------------------- */}

              <div className="tree">

                <span>
                  INDIVIDUAL TREE COUNT
                </span>


                <strong>
                  NOT YET ENABLED
                </strong>


                <p>

                  This system deliberately
                  does not invent a tree count.
                  The next stage connects
                  high-resolution imagery and
                  a trained tree-crown detection
                  model.

                </p>

              </div>



              {/* ---------------------------------------------
                  PIPELINE
              --------------------------------------------- */}

              <div className="pipeline">

                <span>
                  REAL PIPELINE
                </span>


                {[
                  'Earth Engine authenticated',
                  'Sentinel-2 imagery found',
                  'Cloud filtering applied',
                  'AOI area calculated',
                  'NDVI calculated',
                  'Vegetation area calculated'
                ].map(
                  step => (

                    <div key={step}>
                      ✓ {step}
                    </div>

                  )
                )}

              </div>


            </>

          )}


        </aside>


      </div>

    </div>

  );
}