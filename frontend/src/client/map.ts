import axios from "axios"

export class MapClient {
  constructor(private readonly baseUrl: string) {}

  async getState() {
    const { data } = await axios.get(`${this.baseUrl}/map/state`)
    return data
  }

  async addMarker(marker: { id: string; name: string; coordinate: [number, number]; description?: string }) {
    const { data } = await axios.post(`${this.baseUrl}/map/markers`, marker)
    return data
  }

  async locate(body: { query: string; zoom?: number; add_marker?: boolean }) {
    const { data } = await axios.post(`${this.baseUrl}/map/locate`, body)
    return data
  }

  async switchLayer(layerType: "osm" | "satellite" | "terrain") {
    const { data } = await axios.post(`${this.baseUrl}/map/layer`, { layer_type: layerType })
    return data
  }

  async addMeasurement(measurement: { id: string; type: string; value: string; coordinates: any[] }) {
    const { data } = await axios.post(`${this.baseUrl}/map/measurements`, measurement)
    return data
  }

  async addDrawing(drawing: { id: string; type: string; coordinates: any[]; style?: any }) {
    const { data } = await axios.post(`${this.baseUrl}/map/drawings`, drawing)
    return data
  }

  async clearAll() {
    const { data } = await axios.post(`${this.baseUrl}/map/clear-all`)
    return data
  }

  async deleteMeasurement(measurementId: string) {
    const { data } = await axios.delete(`${this.baseUrl}/map/measurements/${measurementId}`)
    return data
  }

  async deleteDrawing(drawingId: string) {
    const { data } = await axios.delete(`${this.baseUrl}/map/drawings/${drawingId}`)
    return data
  }
}


