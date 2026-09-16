#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define TDS_PIN 34
#define VREF 3.3
#define ADC_RES 4096.0  // ESP32 is 12-bit

// BLE UUIDs
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "abcd1234-ab12-ab12-ab12-abcdef123456"

BLECharacteristic *pCharacteristic;
bool deviceConnected = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) { deviceConnected = true; }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    BLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);

  BLEDevice::init("TDS Sensor");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ  // 🔥 FIX 1
  );

  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();

  Serial.println("BLE started, waiting for connection...");
}

void loop() {
  int raw = analogRead(TDS_PIN);
  float voltage = raw * VREF / ADC_RES;
  float tds = (133.42 * pow(voltage, 3)
             - 255.86 * pow(voltage, 2)
             + 857.39 * voltage) * 0.5;

  String quality;
  if (tds < 50)        quality = "Excellent";
  else if (tds < 150)  quality = "Good";
  else if (tds < 300)  quality = "Fair";
  else if (tds < 500)  quality = "Poor";
  else                 quality = "Unsafe";

  String msg = "TDS: " + String(tds, 0) + " ppm | " + quality;
  Serial.println(msg);

  if (deviceConnected) {
    pCharacteristic->setValue(msg.c_str());
    pCharacteristic->notify();

    delay(200); // 🔥 FIX 2 (important for Android 15 stability)
  }

  delay(1000);
}
