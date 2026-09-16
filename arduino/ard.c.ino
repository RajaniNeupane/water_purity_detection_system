#include <SoftwareSerial.h>

SoftwareSerial BT(10, 11);   // RX, TX

const int TdsSensorPin = A0;

float VREF = 5.0;
int SCOUNT = 30;

int analogBuffer[SCOUNT];
int analogBufferTemp[SCOUNT];

float averageVoltage = 0;
float tdsValue = 0;

void setup()
{
  Serial.begin(9600);
  BT.begin(9600);
}

void loop()
{
  static unsigned long analogSampleTimepoint = millis();

  if (millis() - analogSampleTimepoint > 40)
  {
    analogSampleTimepoint = millis();

    static int index = 0;
    analogBuffer[index] = analogRead(TdsSensorPin);
    index++;

    if (index == SCOUNT)
      index = 0;
  }

  static unsigned long printTimepoint = millis();

  if (millis() - printTimepoint > 1000)
  {
    printTimepoint = millis();

    for (int i = 0; i < SCOUNT; i++)
      analogBufferTemp[i] = analogBuffer[i];

    averageVoltage = getMedianNum(analogBufferTemp, SCOUNT) * VREF / 1024.0;

    tdsValue = (133.42 * averageVoltage * averageVoltage * averageVoltage
               -255.86 * averageVoltage * averageVoltage
               +857.39 * averageVoltage) * 0.5;

    String quality;

    if (tdsValue <= 500)
      quality = "SAFE";
    else
      quality = "UNSAFE";

    BT.print("TDS:");
    BT.print((int)tdsValue);
    BT.print(",STATUS:");
    BT.println(quality);

    Serial.print("TDS: ");
    Serial.print((int)tdsValue);
    Serial.print(" ppm");

    Serial.print("   ");

    Serial.println(quality);
  }
}

int getMedianNum(int bArray[], int iFilterLen)
{
  int bTab[iFilterLen];

  for (int i = 0; i < iFilterLen; i++)
    bTab[i] = bArray[i];

  int temp;

  for (int j = 0; j < iFilterLen - 1; j++)
  {
    for (int i = 0; i < iFilterLen - j - 1; i++)
    {
      if (bTab[i] > bTab[i + 1])
      {
        temp = bTab[i];
        bTab[i] = bTab[i + 1];
        bTab[i + 1] = temp;
      }
    }
  }

  if ((iFilterLen & 1) > 0)
    temp = bTab[(iFilterLen - 1) / 2];
  else
    temp = (bTab[iFilterLen / 2] + bTab[iFilterLen / 2 - 1]) / 2;

  return temp;
}