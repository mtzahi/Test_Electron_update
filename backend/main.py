from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Electron Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    text: str


class MessageResponse(BaseModel):
    message: str
    status: str


@app.get("/")
async def root():
    return {"message": "FastAPI Backend is running"}


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/api/echo", response_model=MessageResponse)
async def echo_message(message: Message):
    return MessageResponse(
        message=f"Received: {message.text}",
        status="success"
    )


if __name__ == "__main__":
    import sys
    import uvicorn

    port = 8000
    for i, arg in enumerate(sys.argv):
        if arg == "--port" and i + 1 < len(sys.argv):
            port = int(sys.argv[i + 1])

    uvicorn.run(app, host="127.0.0.1", port=port)
