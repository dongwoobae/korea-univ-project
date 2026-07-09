export interface SubwayStation {
  id: number;
  name: string;
  name_en: string;
  name_zh: string;
  line: string;
  lat: number;
  lng: number;
}

export const SUBWAY_STATIONS: SubwayStation[] = [
  {
    id: 9000001,
    name: "고려대역",
    name_en: "Goryeodae Station",
    name_zh: "高丽大站",
    line: "6호선",
    lat: 37.5895,
    lng: 127.0363,
  },
  {
    id: 9000002,
    name: "안암역",
    name_en: "Anam Station",
    name_zh: "安岩站",
    line: "6호선",
    lat: 37.5862,
    lng: 127.0294,
  },
  {
    id: 9000003,
    name: "보문역",
    name_en: "Bomun Station",
    name_zh: "普门站",
    line: "6호선",
    lat: 37.5853,
    lng: 127.0194,
  },
];
