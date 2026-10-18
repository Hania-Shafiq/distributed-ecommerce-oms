# Machine & Dataset Specs — Label: 50M_final/tuned
_Generated: 2026-10-18T21:46:14.748134_

## System
- **OS**: Windows-11-10.0.26200-SP0
- **CPU**: Intel64 Family 6 Model 186 Stepping 3, GenuineIntel
- **Physical cores**: 10
- **Logical CPUs**: 12
- **RAM total**: 15.58 GB
- **RAM available**: 0.91 GB
- **Free disk**: 731.87 GB

## Versions
- **Python**: 3.14.6
- **Docker**: 29.8.0
- **Locust**: locust 2.46.7 from C:\Users\HP\AppData\Roaming\Python\Python314\site-packages\locust (Python 3.14.6)

## Verified Dataset (Direct DB Measurements)
- **orders_db → orders**: 50,010,711 (18 GB)
- **orders_db → order_items**: 56,144,708
- **users_db  → users**:  1,252,532 (336 MB)

### Order status split
| Status | Count | Share |
|--------|-------|-------|
| CONFIRMED | 49,387,760 | 98.75% |
| FAILED | 622,951 | 1.25% |