FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && pip install -r /app/requirements.txt

COPY . /app

# CloudRun will set PORT; default to 8080 for local runs
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "streamlit run app.py --server.headless true --server.address 0.0.0.0 --server.port ${PORT} --browser.gatherUsageStats false"]

