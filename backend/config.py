import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://patternscanner:patternscanner@localhost:5432/patternscanner")
IBKR_HOST = os.getenv("IBKR_HOST", "127.0.0.1")
IBKR_PORT = int(os.getenv("IBKR_PORT", "7497"))
IBKR_CLIENT_ID = int(os.getenv("IBKR_CLIENT_ID", "1"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SCAN_TIME = os.getenv("SCAN_TIME", "23:02")
TIMEZONE = os.getenv("TIMEZONE", "Asia/Jerusalem")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO", "")
