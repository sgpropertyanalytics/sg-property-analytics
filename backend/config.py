import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    DB_PATH = os.getenv('DB_PATH', 'condo_master.db')
    CSV_FOLDER = os.getenv('CSV_FOLDER', 'rawdata')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    
    # SQLAlchemy configuration
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        f'sqlite:///{os.path.join(os.path.dirname(__file__), os.getenv("DB_PATH", "condo_master.db"))}'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

