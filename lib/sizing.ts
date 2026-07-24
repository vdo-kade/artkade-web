export type SizeChartRow = {
  size: string;
  widthIn: number;
  lengthIn: number;
  sleeveIn: number;
};

// Site-wide default t-shirt measurements (inches), shown via the "?" icon
// next to the size selector on the product detail page. A product can
// override this with its own image (products.sizing_chart_url) -- see
// SizeGuideButton.
export const DEFAULT_TSHIRT_SIZE_CHART: SizeChartRow[] = [
  { size: "S", widthIn: 21.5, lengthIn: 27, sleeveIn: 9 },
  { size: "M", widthIn: 22.5, lengthIn: 28, sleeveIn: 9.5 },
  { size: "L", widthIn: 23.5, lengthIn: 29, sleeveIn: 10 },
  { size: "XL", widthIn: 24.5, lengthIn: 30, sleeveIn: 10.5 },
  { size: "2XL", widthIn: 25.5, lengthIn: 31, sleeveIn: 11 },
];
