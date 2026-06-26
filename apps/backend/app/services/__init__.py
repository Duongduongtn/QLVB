"""Business logic — tách khỏi router để tái sử dụng + dễ test.

Quy tắc:
- Router CHỈ validate input + gọi service + format response.
- Service KHÔNG biết FastAPI (không Request/Response/Depends).
- Service raise AppError (subclass) khi sai nghiệp vụ.
"""
