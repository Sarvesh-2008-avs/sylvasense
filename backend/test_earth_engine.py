import ee

PROJECT_ID = "sylvasense-509515"

ee.Initialize(project=PROJECT_ID)

# Test area around Chennai
aoi = ee.Geometry.Rectangle([
    80.15,
    12.75,
    80.35,
    12.95
])

collection = (
    ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(aoi)
    .filterDate("2026-01-01", "2026-09-23")
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    .sort("CLOUDY_PIXEL_PERCENTAGE")
)

count = collection.size().getInfo()

print("====================================")
print("SYLVASENSE SENTINEL-2 TEST")
print("====================================")
print("Images found:", count)

if count > 0:
    image = ee.Image(collection.first())

    print("Image ID:", image.get("system:index").getInfo())
    print(
        "Cloud percentage:",
        image.get("CLOUDY_PIXEL_PERCENTAGE").getInfo()
    )
    print("Acquisition date:", image.date().format("YYYY-MM-dd").getInfo())
    print("Sentinel-2 connection: SUCCESS")
else:
    print("No suitable Sentinel-2 image found.")