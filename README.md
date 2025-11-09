Amelia - HackPrinceton 2025
Cursor for Air Traffic Controllers. 

Installation directions
```
git clone https://www.github.com/sai-nallani/hack-princeton.git
cd hack-princeton
npm install
pip install -r requirements.txt
```

Now, launch one terminal instance and run
```
npm run dev
```
and on another terminal instance, run
```
python services/main.py
```

In .env, you will need to define
```
VITE_MAPBOX_ACCESS_TOKEN=
XAI_API_KEY=
DEDALUS_API_KEY=
ELEVENLABS_API_KEY=
```

