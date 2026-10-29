from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import requests
import pandas as pd
from prophet import Prophet
import numpy as np
import os
import joblib
from sklearn.preprocessing import LabelEncoder 


MODEL_PATH = 'activity_suitability_model.pkl'
ENCODER_PATH = 'activity_encoder.pkl'

activity_model = None
activity_encoder = None
MODEL_LOAD_SUCCESS = False

try:
    if os.path.exists(MODEL_PATH) and os.path.exists(ENCODER_PATH):
        activity_model = joblib.load(MODEL_PATH)
        activity_encoder = joblib.load(ENCODER_PATH)
        MODEL_LOAD_SUCCESS = True
        print("✅ ML Suitability Model and Encoder loaded successfully.")
    else:
        print("⚠️ ML model files not found. Suitability prediction will fall back to a default status.")
except Exception as e:
    print(f"❌ Error loading ML model: {e}")


app = FastAPI(title="NASA Weather Prediction API")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5173",
    "http://127.000.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POWER_API_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
API_PARAMS = "T2M,PRECTOTCORR,WS10M"
WINDOW_DAYS = 7  
FORECAST_OVERRIDE_DAYS = 3  


class WeatherRequest(BaseModel):
    lat: float
    lon: float
    startDate: str
    endDate: str
    activity: str
    variables: dict

def predict_suitability_ml(pred_data: dict, activity: str) -> str:
    """Uses the loaded ML model to predict suitability."""
    if not MODEL_LOAD_SUCCESS:
        return "Suitable (Fallback)"

    try:
        temp_c = pred_data.get("T2M", 20.0)
        rain_mmh = pred_data.get("PRECTOTCORR", 0.0)
        wind_kmh = pred_data.get("WS10M", 10.0)
        
        
        cloud_percent = pred_data.get("CloudPct", 50.0) 

        try:
            activity_encoded = activity_encoder.transform([activity.lower()])[0]
        except ValueError:
            return "Caution"

        input_features = pd.DataFrame([[
            temp_c,
            wind_kmh,
            rain_mmh,
            cloud_percent,
            activity_encoded
        ]], columns=['T2M', 'WS10M', 'PRECTOTCORR', 'CloudPct', 'Activity_Encoded'])
        
        prediction = activity_model.predict(input_features)[0]
        
        return prediction 
        
    except Exception as e:
        print(f"ML Prediction Error: {e}")
        return "Caution (ML Error)"


def subtract_years(d: datetime, years: int) -> datetime:
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        return d.replace(year=d.year - years, day=28)


def fetch_nasa_data(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    start_fmt = start_date.replace("-", "")
    end_fmt = end_date.replace("-", "")
    params = {
        "parameters": API_PARAMS,
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "start": start_fmt,
        "end": end_fmt,
        "format": "JSON",
    }
    try:
        response = requests.get(POWER_API_URL, params=params, timeout=20)
        print("Fetching:", response.url)
        response.raise_for_status()
        data = response.json()
        return data.get("properties", {}).get("parameter", {})
    except Exception as e:
        print("NASA fetch error:", e)
        return {}


def fetch_current_data(lat: float, lon: float) -> dict:
    """Fetches weather data for yesterday for hybrid prediction."""
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    data = fetch_nasa_data(lat, lon, yesterday, yesterday)

    if not data:
        return {}

    current_data = {}
    date_key = yesterday.replace("-", "")
    for var in API_PARAMS.split(","):
        val = data.get(var, {}).get(date_key)
        if val is not None and val != -999.0:
            if var == "WS10M":
                val *= 3.6 
            current_data[var] = val
    return current_data


@app.post("/predict")
def predict_weather(req: WeatherRequest):

    start_date = datetime.fromisoformat(req.startDate.replace("Z", "").replace("T", " "))
    end_date = datetime.fromisoformat(req.endDate.replace("Z", "").replace("T", " "))
    date_range = pd.date_range(start=start_date, end=end_date)

    current_data = fetch_current_data(req.lat, req.lon)

    historical_data = {}
    for year_offset in range(1, 21):
        hist_start = subtract_years(
            start_date - timedelta(days=WINDOW_DAYS), year_offset
        )
        hist_end = subtract_years(end_date + timedelta(days=WINDOW_DAYS), year_offset)
        year_key = start_date.year - year_offset
        historical_data[year_key] = fetch_nasa_data(
            req.lat,
            req.lon,
            hist_start.strftime("%Y-%m-%d"),
            hist_end.strftime("%Y-%m-%d"),
        )

    full_rows = []

    for var in API_PARAMS.split(","):
        temp_rows = []
        for year, data in historical_data.items():
            for date_str, val in data.get(var, {}).items():
                dt = datetime.strptime(date_str, "%Y%m%d")

                clean_val = (
                    float(val) * 3.6 if var == "WS10M" and val != -999.0 else float(val)
                )

                clean_val = clean_val if clean_val != -999.0 else np.nan

                temp_rows.append({"ds": dt, "y": clean_val, "var": var})

        df = pd.DataFrame(temp_rows).set_index("ds").sort_index()
        full_rows.append(df.rename(columns={"y": var}).drop(columns=["var"]))

    full_df = pd.concat(full_rows, axis=1)

    full_df = full_df.apply(lambda col: col.fillna(col.mean()), axis=0)

    prophet_dfs = {}
    for var in API_PARAMS.split(","):
        prophet_dfs[var] = (
            full_df[[var]]
            .copy()
            .rename(columns={var: "y"})
            .reset_index()
            .rename(columns={"ds": "ds"})
        )

        for reg_var in [v for v in API_PARAMS.split(",") if v != var]:
            prophet_dfs[var][reg_var] = full_df[reg_var].values


    forecast_order = ["PRECTOTCORR", "WS10M", "T2M"]
    forecast_results_df = pd.DataFrame({"ds": date_range})

    WS10M_REGRESSOR_SCALE = 10.0  
    DEFAULT_REGRESSOR_SCALE = 5.0 
    for var in forecast_order:
        df_to_fit = prophet_dfs[var][["ds", "y"]].copy()

        model = Prophet(
            yearly_seasonality=True, daily_seasonality=False, weekly_seasonality=False
        )

        regressors_to_add = [v for v in API_PARAMS.split(",") if v != var]
        future_df = pd.DataFrame({"ds": date_range})

        for reg_var in regressors_to_add:
            scale = DEFAULT_REGRESSOR_SCALE
            if var == "WS10M" and reg_var in ["T2M", "PRECTOTCORR"]:
                scale = WS10M_REGRESSOR_SCALE

            model.add_regressor(reg_var, prior_scale=scale) 

            df_to_fit[reg_var] = full_df[reg_var].values

            reg_mean = full_df[reg_var].mean()
            future_df[reg_var] = reg_mean  

        if df_to_fit.empty:
            continue

        model.fit(df_to_fit)
        forecast = model.predict(future_df)

        var_forecast_column = var
        forecast_results_df = pd.merge(
            forecast_results_df,
            forecast[["ds", "yhat"]].rename(columns={"yhat": var_forecast_column}),
            on="ds",
            how="left",
        )

    predictions = {}
    for _, row in forecast_results_df.iterrows():
        date_str = row["ds"].strftime("%Y-%m-%d")
        predictions[date_str] = {
            "T2M": round(row.get("T2M", np.nan), 2),
            "PRECTOTCORR": round(row.get("PRECTOTCORR", np.nan), 2),
            "WS10M": round(row.get("WS10M", np.nan), 2),
            "CloudPct": 50.0, 
        }

    if current_data:
        for i in range(min(FORECAST_OVERRIDE_DAYS, len(date_range))):
            date_to_override = date_range[i].strftime("%Y-%m-%d")

            current_weight = (FORECAST_OVERRIDE_DAYS - i) / (FORECAST_OVERRIDE_DAYS + 1)
            prophet_weight = 1 - current_weight

            if date_to_override in predictions:
                for var in API_PARAMS.split(","):
                    prophet_val = predictions[date_to_override].get(var)
                    current_val = current_data.get(var)

                    if current_val is not None and prophet_val is not None:
                        hybrid_val = (current_val * current_weight) + ( 
                            prophet_val * prophet_weight
                        )
                        predictions[date_to_override][var] = round(hybrid_val, 2) 

    final_predictions = {}
    for date_str, pred in predictions.items():
        
        suitability_status = predict_suitability_ml(pred, req.activity)
        
        final_predictions[date_str] = {
            "T2M": pred.get("T2M"),
            "PRECTOTCORR": pred.get("PRECTOTCORR"),
            "WS10M": pred.get("WS10M"),
            "suitability_status": suitability_status, 
        }

    return {
        "location": {"lat": req.lat, "lon": req.lon},
        "activity": req.activity,
        "date_range": f"{req.startDate} to {req.endDate}",
        "predictions": final_predictions,
    }