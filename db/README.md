# FrisbeeDAO Database Setup

這個目錄包含了 FrisbeeDAO 項目的 PostgreSQL 數據庫配置文件。

## 文件說明

- `docker-compose.yaml` - 本地開發環境配置（不應上傳到倉庫）
- `docker-compose.prod.yaml` - 生產環境配置模板
- `.env.example` - 環境變量示例文件
- `.gitignore` - Git 忽略文件配置

## 快速開始

### 1. 環境配置

複製環境變量示例文件：
```bash
cp .env.example .env
```

編輯 `.env` 文件，設置你的數據庫密碼：
```env
POSTGRES_PASSWORD=your_secure_password_here
```

### 2. 啟動數據庫

**本地開發環境：**
```bash
docker-compose up -d
```

**生產環境：**
```bash
docker-compose -f docker-compose.prod.yaml up -d
```

### 3. 初始化數據庫

```bash
# 執行數據庫初始化腳本
Get-Content ../backend/scripts/init-database.sql | docker exec -i frisbeedao-postgres psql -U postgres -d frisbeedao
```

### 4. 訪問數據庫

- **數據庫連接：** `localhost:5432`
- **Adminer 管理界面：** http://localhost:8080

## 數據庫信息

- **版本：** PostgreSQL 14
- **數據庫名：** frisbeedao
- **默認用戶：** postgres
- **必需擴展：** uuid-ossp, pgcrypto

## 環境變量

| 變量名 | 默認值 | 說明 |
|--------|--------|------|
| `POSTGRES_DB` | frisbeedao | 數據庫名稱 |
| `POSTGRES_USER` | postgres | 數據庫用戶 |
| `POSTGRES_PASSWORD` | - | 數據庫密碼（必需） |
| `DB_PORT` | 5432 | 數據庫端口 |
| `ADMINER_PORT` | 8080 | Adminer 端口 |

## 注意事項

1. **安全性：** 生產環境請使用強密碼
2. **備份：** 定期備份 `postgres_data` 卷中的數據
3. **網絡：** 生產環境建議配置防火牆規則
4. **監控：** 建議添加數據庫監控和日志記錄