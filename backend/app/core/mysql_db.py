from sqlmodel import SQLModel, create_engine, Session
from app.core.config import settings

# 创建MySQL数据库引擎
mysql_engine = create_engine(
    settings.MYSQL_DATABASE_URI,
    echo=True,  # 开发时显示SQL语句
    pool_pre_ping=True,  # 连接池预检查
    pool_recycle=300,  # 连接回收时间
)

def get_mysql_session():
    """获取MySQL数据库会话"""
    with Session(mysql_engine) as session:
        yield session

def create_mysql_tables():
    """创建MySQL表（如果不存在）"""
    SQLModel.metadata.create_all(mysql_engine)
