import React, { useState, useEffect, useRef } from "react";
import { MapPin, Cloud, Navigation, Search, Loader } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function WeatherLocationSelector() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef(null);
  const googleMapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyAdI9wBpbZMObHzJWbFP4JKDx0Z5RIsNJo&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const initMap = () => {
    if (!mapRef.current || !window.google) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 40.7128, lng: -74.006 }, 
      zoom: 10,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    googleMapRef.current = map;

    map.addListener("click", (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();

      setSelectedLocation({
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
      });

      if (markerRef.current) {
        markerRef.current.setMap(null);
      }

      markerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: map,
        animation: window.google.maps.Animation.DROP,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#EF4444",
          fillOpacity: 1,
          strokeColor: "#FFF",
          strokeWeight: 2,
        },
      });
    });

    setMapLoaded(true);
  };

  const handleUseMyLocation = () => {
    if (navigator.geolocation && googleMapRef.current) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          googleMapRef.current.setCenter({ lat, lng });
          googleMapRef.current.setZoom(13);

          setSelectedLocation({
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
          });

          if (markerRef.current) {
            markerRef.current.setMap(null);
          }

          markerRef.current = new window.google.maps.Marker({
            position: { lat, lng },
            map: googleMapRef.current,
            animation: window.google.maps.Animation.DROP,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#3B82F6",
              fillOpacity: 1,
              strokeColor: "#FFF",
              strokeWeight: 2,
            },
          });
        },
        (error) => {
          console.error("Error getting location:", error);
          alert(
            "Unable to get your location. Please check your browser permissions."
          );
        }
      );
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery || !googleMapRef.current || !window.google) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: searchQuery }, (results, status) => {
      if (status === "OK" && results[0]) {
        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();

        googleMapRef.current.setCenter({ lat, lng });
        googleMapRef.current.setZoom(13);

        setSelectedLocation({
          lat: lat.toFixed(6),
          lng: lng.toFixed(6),
        });

        if (markerRef.current) {
          markerRef.current.setMap(null);
        }

        markerRef.current = new window.google.maps.Marker({
          position: { lat, lng },
          map: googleMapRef.current,
          animation: window.google.maps.Animation.DROP,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#EF4444",
            fillOpacity: 1,
            strokeColor: "#FFF",
            strokeWeight: 2,
          },
        });
      } else {
        alert("Location not found. Please try a different search term.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl">
                <Cloud className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                SkyView Weather
              </h1>
            </div>
            <button
              onClick={handleUseMyLocation}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Navigation className="w-4 h-4" />
              Use My Location
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-500" />
                  Select Your Location
                </CardTitle>
                <CardDescription>
                  Click anywhere on the map to get weather information for that
                  location
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearch} className="mb-4 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search for a city or address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </form>

                <div className="relative w-full h-96 bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                  <div ref={mapRef} className="w-full h-full"></div>

                  {!mapLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                      <div className="text-center">
                        <Loader className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                        <p className="text-gray-600">Loading map...</p>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-sm text-gray-500 mt-2 text-center">
                  💡 Replace 'AIzaSyAdI9wBpbZMObHzJWbFP4JKDx0Z5RIsNJo to enable
                  full functionality
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <CardHeader>
                <CardTitle>Location Coordinates</CardTitle>
                <CardDescription className="text-blue-100">
                  Selected location details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedLocation ? (
                  <>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                      <div className="text-sm text-blue-100 mb-1">Latitude</div>
                      <div className="text-2xl font-bold font-mono">
                        {selectedLocation.lat}°
                      </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                      <div className="text-sm text-blue-100 mb-1">
                        Longitude
                      </div>
                      <div className="text-2xl font-bold font-mono">
                        {selectedLocation.lng}°
                      </div>
                    </div>
                    <button className="w-full bg-white text-blue-600 font-semibold py-3 rounded-lg hover:bg-blue-50 transition-colors">
                      Get Weather Data
                    </button>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-blue-100">
                      Click on the map to select a location
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedLocation && (
              <Alert className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
                <AlertDescription className="text-sm">
                  <span className="font-semibold text-amber-900">
                    Next Step:
                  </span>
                  <p className="text-amber-800 mt-1">
                    These coordinates will be used to fetch weather data from
                    your weather API service.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <Card className="border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 rounded-full p-1 mt-0.5">
                    <div className="w-5 h-5 flex items-center justify-center text-blue-600 font-bold text-xs">
                      1
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      Select Location
                    </div>
                    <div>Click anywhere on the map or search for a city</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 rounded-full p-1 mt-0.5">
                    <div className="w-5 h-5 flex items-center justify-center text-blue-600 font-bold text-xs">
                      2
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      Get Coordinates
                    </div>
                    <div>Latitude and longitude are automatically captured</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 rounded-full p-1 mt-0.5">
                    <div className="w-5 h-5 flex items-center justify-center text-blue-600 font-bold text-xs">
                      3
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      Fetch Weather
                    </div>
                    <div>Use coordinates to get real-time weather data</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
