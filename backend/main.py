# ============================================================
# SYLVASENSE
# Real Forest Intelligence Backend
#
# Google Earth Engine
# Sentinel-2 NDVI analysis
# Sentinel-1 + Sentinel-2 change detection
# FastAPI backend
# ============================================================

from typing import List, Optional
from pathlib import Path
import os
import tempfile
import subprocess
import json

import ee

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ============================================================
# CONFIGURATION
# ============================================================

PROJECT_ID = "sylvasense-509515"

app = FastAPI(
    title="SYLVASENSE API",
    description="Real satellite-based forest intelligence backend",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# EARTH ENGINE INITIALIZATION
# ============================================================

EE_READY = False
EE_ERROR = None

try:
    ee.Initialize(project=PROJECT_ID)
    EE_READY = True
    print("======================================")
    print("SYLVASENSE EARTH ENGINE")
    print("Connection: SUCCESS")
    print(f"Project: {PROJECT_ID}")
    print("======================================")

except Exception as e:
    EE_READY = False
    EE_ERROR = str(e)

    print("======================================")
    print("SYLVASENSE EARTH ENGINE")
    print("Connection: FAILED")
    print(EE_ERROR)
    print("======================================")


# ============================================================
# REQUEST MODELS
# ============================================================

class AnalyzeRequest(BaseModel):
    coordinates: List[List[float]]

    start_date: str = "2025-01-01"
    end_date: str = "2026-09-23"

    max_cloud: float = 20.0

    # Optional selected forest-location profile.
    location_id: Optional[str] = None
    location_name: Optional[str] = None
    forest_type: Optional[str] = None

    # Optional tree-density and biomass assumptions.
    # When omitted, the backend derives a density class from NDVI
    # and uses 108 kg as the default average biomass per tree.
    tree_density_per_ha: Optional[float] = None
    average_biomass_per_tree_kg: Optional[float] = None


class ChangeRequest(BaseModel):
    coordinates: List[List[float]]

    before_start: str = "2025-01-01"
    before_end: str = "2025-06-30"

    after_start: str = "2026-01-01"
    after_end: str = "2026-06-30"

    max_cloud: float = 30.0


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
def root():

    return {
        "project": "SYLVASENSE",
        "status": "online",
        "earth_engine": EE_READY,
        "earth_engine_project": PROJECT_ID
    }


@app.get("/api/health")
def health():

    return {
        "status": "healthy" if EE_READY else "degraded",
        "earth_engine": EE_READY,
        "project": PROJECT_ID,
        "error": EE_ERROR
    }


# ============================================================
# AOI HELPER
# ============================================================

def create_geometry(coordinates: List[List[float]]):

    if not coordinates:
        raise HTTPException(
            status_code=400,
            detail="No coordinates were supplied."
        )

    if len(coordinates) < 3:
        raise HTTPException(
            status_code=400,
            detail="At least 3 polygon points are required."
        )

    ring = []

    for point in coordinates:

        if len(point) < 2:
            raise HTTPException(
                status_code=400,
                detail="Invalid coordinate."
            )

        lon = float(point[0])
        lat = float(point[1])

        ring.append([lon, lat])

    # Close polygon
    if ring[0] != ring[-1]:
        ring.append(ring[0])

    geometry = ee.Geometry.Polygon(
        [ring]
    )

    return geometry


# ============================================================
# SENTINEL-1 COLLECTION
# ============================================================

def get_sentinel1_collection(
    geometry,
    start_date,
    end_date
):
    """
    Sentinel-1 GRD IW imagery with VV + VH polarization.
    Values in the GRD product are in dB.
    """

    collection = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(geometry)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(
            ee.Filter.listContains(
                "transmitterReceiverPolarisation",
                "VV"
            )
        )
        .filter(
            ee.Filter.listContains(
                "transmitterReceiverPolarisation",
                "VH"
            )
        )
        .select(["VV", "VH"])
    )

    return collection


# ============================================================
# SENTINEL-2 COLLECTION
# ============================================================

def get_sentinel2_collection(
    geometry,
    start_date,
    end_date,
    max_cloud
):

    collection = (
        ee.ImageCollection(
            "COPERNICUS/S2_SR_HARMONIZED"
        )
        .filterBounds(geometry)
        .filterDate(
            start_date,
            end_date
        )
        .filter(
            ee.Filter.lt(
                "CLOUDY_PIXEL_PERCENTAGE",
                max_cloud
            )
        )
    )

    return collection


# ============================================================
# SENTINEL-2 ANALYSIS
# ============================================================

@app.post("/api/analyze")
def analyze(request: AnalyzeRequest):

    if not EE_READY:

        raise HTTPException(
            status_code=500,
            detail=(
                "Google Earth Engine is not initialized. "
                f"{EE_ERROR}"
            )
        )

    try:

        # ----------------------------------------------------
        # CREATE AOI
        # ----------------------------------------------------

        geometry = create_geometry(
            request.coordinates
        )

        # ----------------------------------------------------
        # AREA
        # ----------------------------------------------------

        area_m2 = geometry.area(
            maxError=10
        ).getInfo()

        area_ha = area_m2 / 10000.0

        # ----------------------------------------------------
        # SENTINEL-2 COLLECTION
        # ----------------------------------------------------

        collection = get_sentinel2_collection(
            geometry,
            request.start_date,
            request.end_date,
            request.max_cloud
        )

        image_count = collection.size().getInfo()

        if image_count == 0:

            raise HTTPException(
                status_code=404,
                detail=(
                    "No Sentinel-2 images were found "
                    "for the selected area and date range."
                )
            )

        # ----------------------------------------------------
        # SELECT LOWEST-CLOUD IMAGE
        # ----------------------------------------------------

        image = (
            collection
            .sort("CLOUDY_PIXEL_PERCENTAGE")
            .first()
        )

        # ----------------------------------------------------
        # IMAGE DATE
        # ----------------------------------------------------

        image_date = (
            image
            .date()
            .format("YYYY-MM-dd")
            .getInfo()
        )

        # ----------------------------------------------------
        # CLOUD COVER
        # ----------------------------------------------------

        cloud_cover = image.get(
            "CLOUDY_PIXEL_PERCENTAGE"
        ).getInfo()

        # ----------------------------------------------------
        # NDVI
        #
        # NDVI = (NIR - RED) / (NIR + RED)
        #
        # Sentinel-2:
        # B8 = NIR
        # B4 = RED
        # ----------------------------------------------------

        ndvi = (
            image
            .normalizedDifference(
                ["B8", "B4"]
            )
            .rename("NDVI")
        )

        # ----------------------------------------------------
        # MEAN NDVI
        # ----------------------------------------------------

        ndvi_result = (
            ndvi
            .reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=10,
                maxPixels=1_000_000_000,
                bestEffort=True
            )
            .get("NDVI")
            .getInfo()
        )

        if ndvi_result is None:

            ndvi_result = 0.0

        mean_ndvi = float(ndvi_result)

        # ----------------------------------------------------
        # VEGETATION MASK
        #
        # NDVI > 0.40
        #
        # This is a vegetation screening threshold,
        # not a certified forest classification.
        # ----------------------------------------------------

        vegetation_mask = ndvi.gt(
            0.40
        )

        # ----------------------------------------------------
        # PIXEL AREA
        # ----------------------------------------------------

        pixel_area = ee.Image.pixelArea()

        vegetation_area_image = (
            pixel_area
            .updateMask(
                vegetation_mask
            )
        )

        vegetation_area_m2 = (
            vegetation_area_image
            .reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=geometry,
                scale=10,
                maxPixels=1_000_000_000,
                bestEffort=True
            )
            .get("area")
            .getInfo()
        )

        if vegetation_area_m2 is None:

            vegetation_area_m2 = 0.0

        vegetation_area_ha = (
            vegetation_area_m2 / 10000.0
        )

        # ----------------------------------------------------
        # VEGETATION PERCENTAGE
        # ----------------------------------------------------

        if area_ha > 0:

            vegetation_percentage = (
                vegetation_area_ha
                / area_ha
                * 100
            )

        else:

            vegetation_percentage = 0.0

        # ----------------------------------------------------
        # CLASSIFICATION
        # ----------------------------------------------------

        if mean_ndvi >= 0.65:

            classification = "Dense Vegetation"

        elif mean_ndvi >= 0.50:

            classification = "Moderate Vegetation"

        elif mean_ndvi >= 0.35:

            classification = "Sparse Vegetation"

        elif mean_ndvi >= 0.15:

            classification = "Low Vegetation"

        else:

            classification = "Non-Vegetated / Bare Surface"

        # ----------------------------------------------------
        # FOREST SCREENING STATUS
        # ----------------------------------------------------

        if mean_ndvi >= 0.50:

            forest_status = "High vegetation signal"

        elif mean_ndvi >= 0.35:

            forest_status = "Moderate vegetation signal"

        else:

            forest_status = "Low vegetation signal"

        # ----------------------------------------------------
        # NDVI THUMBNAIL
        # ----------------------------------------------------

        thumbnail_params = {

            "min": -0.2,

            "max": 0.8,

            "palette": [
                "8c510a",
                "d8b365",
                "f6e8c3",
                "c7eae5",
                "5ab4ac",
                "01665e"
            ],

            "dimensions": 1024,

            "region": geometry,

            "format": "png"
        }

        ndvi_thumbnail = ndvi.getThumbURL(
            thumbnail_params
        )

        # ----------------------------------------------------
        # TRUE COLOR THUMBNAIL
        # ----------------------------------------------------

        true_color = image.visualize(
            bands=[
                "B4",
                "B3",
                "B2"
            ],
            min=0,
            max=3000
        )

        true_color_thumbnail = (
            true_color.getThumbURL(
                {
                    "dimensions": 1024,
                    "region": geometry,
                    "format": "png"
                }
            )
        )

        # ----------------------------------------------------
        # SENTINEL-1 SAR ANALYSIS
        # ----------------------------------------------------
        #
        # This adds real radar information to the main analysis.
        # VV and VH are returned in dB. If no suitable S1 image
        # exists for the AOI/date range, the values remain null.
                # ----------------------------------------------------
        # SENTINEL-1 SAR ANALYSIS
        # ----------------------------------------------------

        s1_collection = get_sentinel1_collection(
            geometry,
            request.start_date,
            request.end_date
        )

        s1_image_count = (
            s1_collection
            .size()
            .getInfo()
        )

        s1_vv_mean = None
        s1_vh_mean = None
        s1_vv_vh_difference = None
        s1_date = None

        if s1_image_count > 0:

            s1_image = (
                s1_collection
                .sort("system:time_start", False)
                .first()
            )

            s1_date = (
                s1_image
                .date()
                .format("YYYY-MM-dd")
                .getInfo()
            )

            s1_stats = (
                s1_image
                .reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=geometry,
                    scale=10,
                    maxPixels=1_000_000_000,
                    bestEffort=True
                )
                .getInfo()
            )

            if s1_stats:

                if s1_stats.get("VV") is not None:

                    s1_vv_mean = float(
                        s1_stats["VV"]
                    )

                if s1_stats.get("VH") is not None:

                    s1_vh_mean = float(
                        s1_stats["VH"]
                    )

                if (
                    s1_vv_mean is not None
                    and
                    s1_vh_mean is not None
                ):

                    s1_vv_vh_difference = (
                        s1_vv_mean
                        - s1_vh_mean
                    )

        # ----------------------------------------------------
        # TREE ESTIMATION
        # ----------------------------------------------------
        #
        # Sentinel-2 has 10 m spatial resolution and cannot
        # reliably resolve individual tree crowns.
        #
        # Therefore this is an ESTIMATE based on:
        #
        # AOI area × estimated tree density
        #
        # This is different from the experimental DeepForest
        # uploaded-image detector.
        # ----------------------------------------------------

        if mean_ndvi >= 0.50:

            default_density = 540.0
            density_class = "Dense vegetation"

        elif mean_ndvi >= 0.35:

            default_density = 350.0
            density_class = "Moderate vegetation"

        else:

            default_density = 180.0
            density_class = "Low vegetation"

        # Use selected-location density if supplied.
        if request.tree_density_per_ha is not None:

            requested_density = float(
                request.tree_density_per_ha
            )

        else:

            requested_density = default_density

        if requested_density <= 0:

            requested_density = default_density

        tree_density = requested_density

        # Estimated tree count.
        estimated_tree_count = max(
            0,
            round(
                area_ha
                * tree_density
            )
        )

        # ----------------------------------------------------
        # AVERAGE BIOMASS PER TREE
        # ----------------------------------------------------

        if request.average_biomass_per_tree_kg is not None:

            average_biomass_per_tree_kg = float(
                request.average_biomass_per_tree_kg
            )

        else:

            average_biomass_per_tree_kg = 108.0

        if average_biomass_per_tree_kg <= 0:

            average_biomass_per_tree_kg = 108.0

        # ----------------------------------------------------
        # ABOVE-GROUND BIOMASS
        # ----------------------------------------------------
        #
        # AGB =
        # Tree Count × Average Biomass per Tree
        # ----------------------------------------------------

        biomass_kg = (
            estimated_tree_count
            * average_biomass_per_tree_kg
        )

        biomass_tonnes = (
            biomass_kg / 1000.0
        )

        # ----------------------------------------------------
        # STORED CARBON
        # ----------------------------------------------------
        #
        # Carbon = AGB × 0.47
        # ----------------------------------------------------

        stored_carbon_tonnes_c = (
            biomass_tonnes * 0.47
        )

        # ----------------------------------------------------
        # CARBON DENSITY
        # ----------------------------------------------------

        carbon_density_tonnes_c_per_ha = (

            stored_carbon_tonnes_c / area_ha

            if area_ha > 0

            else 0
        )

        # ----------------------------------------------------
        # RESULT
        # ----------------------------------------------------

        return {

            "success": True,

            "source": "Google Earth Engine",

            "satellite": "Sentinel-2",

            "image": {

                "date": image_date,

                "cloud_cover": round(
                    float(cloud_cover),
                    4
                ),

                "images_found": image_count
            },

            "aoi": {

                "area_hectares": round(
                    area_ha,
                    3
                ),

                "area_square_meters": round(
                    area_m2,
                    2
                )
            },

            "vegetation": {

                "mean_ndvi": round(
                    mean_ndvi,
                    4
                ),

                "vegetation_area_hectares": round(
                    vegetation_area_ha,
                    3
                ),

                "vegetation_percentage": round(
                    vegetation_percentage,
                    2
                )
            },

            "classification": {

                "type": classification,

                "status": forest_status,

                "method": (
                    "Sentinel-2 NDVI spectral screening"
                )
            },

            "sentinel1": {

                "available": (
                    s1_image_count > 0
                ),

                "images_found": (
                    s1_image_count
                ),

                "selected_date": s1_date,

                "mean_vv_db": (

                    round(
                        s1_vv_mean,
                        4
                    )

                    if s1_vv_mean is not None

                    else None
                ),

                "mean_vh_db": (

                    round(
                        s1_vh_mean,
                        4
                    )

                    if s1_vh_mean is not None

                    else None
                ),

                "vv_minus_vh_db": (

                    round(
                        s1_vv_vh_difference,
                        4
                    )

                    if s1_vv_vh_difference is not None

                    else None
                ),

                "method": (
                    "Sentinel-1 GRD IW SAR "
                    "VV/VH screening"
                )
            },

            # ------------------------------------------------
            # ESTIMATED TREE INFORMATION
            # ------------------------------------------------

            "tree_detection": {

                "enabled": True,

                "count": estimated_tree_count,

                "estimated": True,

                "method": (
                    "AOI area × estimated tree density"
                ),

                "density_trees_per_ha": round(
                    tree_density,
                    2
                ),

                "density_class": density_class,

                "message": (
                    "Estimated from AOI area and "
                    "vegetation density. This is not "
                    "individual tree-crown detection."
                )
            },

            # ------------------------------------------------
            # TREE + BIOMASS + CARBON
            # ------------------------------------------------

            "tree_estimation": {

                "enabled": True,

                "location": {

                    "id": request.location_id,

                    "name": request.location_name,

                    "forest_type": request.forest_type
                },

                "estimated_tree_count": (
                    estimated_tree_count
                ),

                "tree_density_per_ha": round(
                    tree_density,
                    2
                ),

                "density_class": density_class,

                "average_biomass_per_tree_kg": round(
                    average_biomass_per_tree_kg,
                    2
                ),

                "above_ground_biomass_tonnes": round(
                    biomass_tonnes,
                    3
                ),

                "stored_carbon_tonnes_c": round(
                    stored_carbon_tonnes_c,
                    3
                ),

                "carbon_density_tonnes_c_per_ha": round(
                    carbon_density_tonnes_c_per_ha,
                    3
                ),

                "estimated": True,

                "method": (
                    "AOI area × estimated tree density; "
                    "AGB = tree count × average biomass "
                    "per tree; carbon = AGB × 0.47"
                )
            },

            # ------------------------------------------------
            # IMAGERY
            # ------------------------------------------------

            "imagery": {

                "ndvi_thumbnail": (
                    ndvi_thumbnail
                ),

                "true_color_thumbnail": (
                    true_color_thumbnail
                )
            }
        }

    except HTTPException:

        raise

    except Exception as e:

        print(
            "SYLVASENSE ANALYSIS ERROR:",
            str(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# REAL SENTINEL-1 + SENTINEL-2 CHANGE DETECTION
# ============================================================

@app.post("/api/change-detection")
def change_detection(
    request: ChangeRequest
):

    if not EE_READY:

        raise HTTPException(
            status_code=500,
            detail=(
                "Google Earth Engine is not initialized. "
                f"{EE_ERROR}"
            )
        )

    try:

        # ----------------------------------------------------
        # AOI
        # ----------------------------------------------------

        geometry = create_geometry(
            request.coordinates
        )

        # ====================================================
        # SENTINEL-2 BEFORE
        # ====================================================

        s2_before_collection = (

            ee.ImageCollection(
                "COPERNICUS/S2_SR_HARMONIZED"
            )

            .filterBounds(
                geometry
            )

            .filterDate(
                request.before_start,
                request.before_end
            )

            .filter(
                ee.Filter.lt(
                    "CLOUDY_PIXEL_PERCENTAGE",
                    request.max_cloud
                )
            )
        )

        before_count = (

            s2_before_collection
            .size()
            .getInfo()
        )

        if before_count == 0:

            raise HTTPException(
                status_code=404,
                detail=(
                    "No Sentinel-2 imagery found "
                    "for the earlier period."
                )
            )

        s2_before = (

            s2_before_collection
            .sort(
                "CLOUDY_PIXEL_PERCENTAGE"
            )
            .first()
        )

        # ====================================================
        # SENTINEL-2 AFTER
        # ====================================================

        s2_after_collection = (

            ee.ImageCollection(
                "COPERNICUS/S2_SR_HARMONIZED"
            )

            .filterBounds(
                geometry
            )

            .filterDate(
                request.after_start,
                request.after_end
            )

            .filter(
                ee.Filter.lt(
                    "CLOUDY_PIXEL_PERCENTAGE",
                    request.max_cloud
                )
            )
        )

        after_count = (

            s2_after_collection
            .size()
            .getInfo()
        )

        if after_count == 0:

            raise HTTPException(
                status_code=404,
                detail=(
                    "No Sentinel-2 imagery found "
                    "for the newer period."
                )
            )

        s2_after = (

            s2_after_collection
            .sort(
                "CLOUDY_PIXEL_PERCENTAGE"
            )
            .first()
        )

        # ====================================================
        # NDVI BEFORE
        # ====================================================

        ndvi_before = (

            s2_before
            .normalizedDifference(
                ["B8", "B4"]
            )
            .rename("NDVI")
        )

        # ====================================================
        # NDVI AFTER
        # ====================================================

        ndvi_after = (

            s2_after
            .normalizedDifference(
                ["B8", "B4"]
            )
            .rename("NDVI")
        )

        # ====================================================
        # NDVI CHANGE
        # ====================================================

        ndvi_change = (

            ndvi_after
            .subtract(
                ndvi_before
            )
            .rename("NDVI_CHANGE")
        )

        # ====================================================
        # MEAN NDVI BEFORE
        # ====================================================

        before_ndvi_result = (

            ndvi_before
            .reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=10,
                maxPixels=1_000_000_000,
                bestEffort=True
            )
            .get("NDVI")
            .getInfo()
        )

        # ====================================================
        # MEAN NDVI AFTER
        # ====================================================

        after_ndvi_result = (

            ndvi_after
            .reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=10,
                maxPixels=1_000_000_000,
                bestEffort=True
            )
            .get("NDVI")
            .getInfo()
        )

        if before_ndvi_result is None:

            before_ndvi_result = 0.0

        if after_ndvi_result is None:

            after_ndvi_result = 0.0

        ndvi_before_value = float(
            before_ndvi_result
        )

        ndvi_after_value = float(
            after_ndvi_result
        )

        ndvi_difference = (

            ndvi_after_value
            - ndvi_before_value
        )

        # ====================================================
        # SENTINEL-1 BEFORE
        # ====================================================

        s1_before_collection = (

            ee.ImageCollection(
                "COPERNICUS/S1_GRD"
            )

            .filterBounds(
                geometry
            )

            .filterDate(
                request.before_start,
                request.before_end
            )

            .filter(
                ee.Filter.eq(
                    "instrumentMode",
                    "IW"
                )
            )

            .filter(
                ee.Filter.listContains(
                    "transmitterReceiverPolarisation",
                    "VV"
                )
            )

            .filter(
                ee.Filter.listContains(
                    "transmitterReceiverPolarisation",
                    "VH"
                )
            )

            .select(
                ["VV", "VH"]
            )
        )

        s1_before_count = (

            s1_before_collection
            .size()
            .getInfo()
        )

        # ====================================================
        # SENTINEL-1 AFTER
        # ====================================================

        s1_after_collection = (

            ee.ImageCollection(
                "COPERNICUS/S1_GRD"
            )

            .filterBounds(
                geometry
            )

            .filterDate(
                request.after_start,
                request.after_end
            )

            .filter(
                ee.Filter.eq(
                    "instrumentMode",
                    "IW"
                )
            )

            .filter(
                ee.Filter.listContains(
                    "transmitterReceiverPolarisation",
                    "VV"
                )
            )

            .filter(
                ee.Filter.listContains(
                    "transmitterReceiverPolarisation",
                    "VH"
                )
            )

            .select(
                ["VV", "VH"]
            )
        )

        s1_after_count = (

            s1_after_collection
            .size()
            .getInfo()
        )

        # ====================================================
        # SENTINEL-1 CHANGE
        # ====================================================

        radar_difference = None

        if (
            s1_before_count > 0
            and
            s1_after_count > 0
        ):

            radar_before = (

                s1_before_collection
                .median()
                .select("VV")
            )

            radar_after = (

                s1_after_collection
                .median()
                .select("VV")
            )

            radar_change = (

                radar_after
                .subtract(
                    radar_before
                )
                .rename("VV_CHANGE")
            )

            radar_result = (

                radar_change
                .reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=geometry,
                    scale=10,
                    maxPixels=1_000_000_000,
                    bestEffort=True
                )
                .get("VV_CHANGE")
                .getInfo()
            )

            if radar_result is not None:

                radar_difference = float(
                    radar_result
                )

        # ====================================================
        # CHANGE INTERPRETATION
        # ====================================================

        if ndvi_difference <= -0.20:

            status = "Potential Forest Change"

        elif ndvi_difference <= -0.10:

            status = "Vegetation Decline Detected"

        elif ndvi_difference >= 0.10:

            status = "Vegetation Increase Detected"

        else:

            status = "No Significant Vegetation Change"

        # ====================================================
        # CHANGE THUMBNAIL
        # ====================================================

        change_params = {

            "min": -0.4,

            "max": 0.4,

            "palette": [
                "7f0000",
                "d7301f",
                "fc8d59",
                "ffffbf",
                "91cf60",
                "1a9850"
            ],

            "dimensions": 1024,

            "region": geometry,

            "format": "png"
        }

        change_thumbnail = (

            ndvi_change
            .getThumbURL(
                change_params
            )
        )

        # ====================================================
        # IMAGE DATES
        # ====================================================

        before_date = (

            s2_before
            .date()
            .format("YYYY-MM-dd")
            .getInfo()
        )

        after_date = (

            s2_after
            .date()
            .format("YYYY-MM-dd")
            .getInfo()
        )

        # ====================================================
        # RESULT
        # ====================================================

        return {

            "success": True,

            "comparison": {

                "before_period": {

                    "start":
                        request.before_start,

                    "end":
                        request.before_end,

                    "images_found":
                        before_count,

                    "selected_date":
                        before_date
                },

                "after_period": {

                    "start":
                        request.after_start,

                    "end":
                        request.after_end,

                    "images_found":
                        after_count,

                    "selected_date":
                        after_date
                }
            },

            "sentinel2": {

                "ndvi_before": round(
                    ndvi_before_value,
                    4
                ),

                "ndvi_after": round(
                    ndvi_after_value,
                    4
                ),

                "ndvi_change": round(
                    ndvi_difference,
                    4
                )
            },

            "sentinel1": {

                "before_images":
                    s1_before_count,

                "after_images":
                    s1_after_count,

                "vv_change_db": (

                    round(
                        radar_difference,
                        4
                    )

                    if radar_difference is not None

                    else None
                )
            },

            "change": {

                "status": status,

                "method": (
                    "Sentinel-2 NDVI temporal "
                    "comparison with Sentinel-1 "
                    "VV radar change"
                ),

                "note": (
                    "This is an automated satellite "
                    "screening indicator. It should "
                    "be verified using higher-resolution "
                    "imagery or field observations."
                )
            },

            "imagery": {

                "ndvi_change_thumbnail":
                    change_thumbnail
            }
        }

    except HTTPException:

        raise

    except Exception as e:

        print(
            "SYLVASENSE CHANGE DETECTION ERROR:",
            str(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
        # ============================================================
# AI TREE DETECTION
# ============================================================

TREE_MODEL_PATH = (
    Path(__file__).resolve().parent
    / "ai"
    / "tree_training"
    / "trained_tree_model_v2.ckpt"
)


DEEPFOREST_PYTHON = (
    Path(__file__).resolve().parent
    / ".venv-deepforest"
    / "Scripts"
    / "python.exe"
)


TREE_HELPER = (
    Path(__file__).resolve().parent
    / "ai"
    / "tree_training"
    / "run_uploaded_tree_detection.py"
)


# ============================================================
# TREE DETECTION STATUS
# ============================================================

@app.get("/api/tree-detection/status")
def tree_detection_status():

    available = (
        TREE_MODEL_PATH.exists()
        and DEEPFOREST_PYTHON.exists()
        and TREE_HELPER.exists()
    )

    return {

        "available": available,

        "status": (
            "ready"
            if available
            else "model_missing"
        ),

        "model": "DeepForest V2",

        "model_file": TREE_MODEL_PATH.name,

        "message": (

            "Experimental AI tree detection is ready."

            if available

            else
            "DeepForest V2 files are missing."
        ),
    }


# ============================================================
# UPLOADED IMAGE TREE DETECTION
# ============================================================

@app.post("/api/tree-detection")
async def tree_detection(
    image: UploadFile = File(...)
):

    allowed = {

        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/tiff",
        "image/webp",
    }

    if image.content_type not in allowed:

        raise HTTPException(

            status_code=400,

            detail=(
                "Please upload a JPG, PNG, TIFF, "
                "or WEBP image."
            )
        )

    if not TREE_MODEL_PATH.exists():

        raise HTTPException(

            status_code=503,

            detail=(
                "DeepForest V2 model is missing."
            )
        )

    if not DEEPFOREST_PYTHON.exists():

        raise HTTPException(

            status_code=503,

            detail=(
                "DeepForest Python environment "
                "is missing."
            )
        )

    if not TREE_HELPER.exists():

        raise HTTPException(

            status_code=503,

            detail=(
                "Tree detection helper script "
                "is missing."
            )
        )

    temp_path = None

    try:

        # ----------------------------------------------------
        # READ UPLOADED IMAGE
        # ----------------------------------------------------

        data = await image.read()

        if not data:

            raise HTTPException(

                status_code=400,

                detail=(
                    "Uploaded image is empty."
                )
            )

        # ----------------------------------------------------
        # TEMPORARY IMAGE FILE
        # ----------------------------------------------------

        suffix = (
            Path(
                image.filename or "forest.jpg"
            ).suffix
            or ".jpg"
        )

        with tempfile.NamedTemporaryFile(

            delete=False,

            suffix=suffix

        ) as tmp:

            tmp.write(data)

            temp_path = tmp.name

        # ----------------------------------------------------
        # RUN DEEPFOREST
        # ----------------------------------------------------

        process = subprocess.run(

            [

                str(DEEPFOREST_PYTHON),

                str(TREE_HELPER),

                temp_path,

                str(TREE_MODEL_PATH),

            ],

            capture_output=True,

            text=True,

            timeout=180,
        )

        # ----------------------------------------------------
        # PROCESS ERROR
        # ----------------------------------------------------

        if process.returncode != 0:

            raise HTTPException(

                status_code=500,

                detail=(
                    "Tree detection process failed: "
                    + process.stderr[-1000:]
                )
            )

        # ----------------------------------------------------
        # READ JSON OUTPUT
        # ----------------------------------------------------

        output = process.stdout.strip()

        tree_count = None

        for line in output.splitlines():

            line = line.strip()

            if (
                line.startswith("{")
                and
                line.endswith("}")
            ):

                try:

                    parsed = json.loads(
                        line
                    )

                    if "tree_count" in parsed:

                        tree_count = int(
                            parsed["tree_count"]
                        )

                        break

                except Exception:

                    pass

        # ----------------------------------------------------
        # NO RESULT
        # ----------------------------------------------------

        if tree_count is None:

            raise HTTPException(

                status_code=500,

                detail=(
                    "Tree detector returned "
                    "no tree count."
                )
            )

        # ----------------------------------------------------
        # SUCCESS
        # ----------------------------------------------------

        return {

            "success": True,

            "model": "DeepForest V2",

            "model_file":
                TREE_MODEL_PATH.name,

            "tree_count":
                tree_count,

            "experimental": True,

            "message": (
                "Experimental AI tree detection "
                "completed successfully."
            ),
        }

    except HTTPException:

        raise

    except subprocess.TimeoutExpired:

        raise HTTPException(

            status_code=504,

            detail=(
                "Tree detection timed out "
                "after 180 seconds."
            )
        )

    except Exception as exc:

        raise HTTPException(

            status_code=500,

            detail=(
                f"Tree detection error: {str(exc)}"
            )
        )

    finally:

        # ----------------------------------------------------
        # DELETE TEMPORARY FILE
        # ----------------------------------------------------

        if temp_path:

            try:

                Path(
                    temp_path
                ).unlink(
                    missing_ok=True
                )

            except Exception:

                pass
            