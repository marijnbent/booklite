import ePub, {
  type Book,
  type Location,
  type Rendition,
} from "epubjs";

export type ReaderBook = Book;
export type ReaderLocation = Location;
export type ReaderRendition = Rendition;
export type ReaderRenderOptions = {
  flow?: string;
  width?: string | number;
  height?: string | number;
  overflow?: string;
  method?: "blobUrl" | "srcdoc" | "write";
  spread?: "none" | "auto" | "always";
  minSpreadWidth?: number;
};

export const openReaderBook = async (data: ArrayBuffer): Promise<ReaderBook> => {
  const book = ePub();
  await book.open(data, "binary");
  return book;
};

export const renderReaderBook = (
  book: ReaderBook,
  element: Element,
  options: ReaderRenderOptions
): ReaderRendition =>
  book.renderTo(element, options as never);
