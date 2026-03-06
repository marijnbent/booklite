import { describe, expect, it } from "vitest";
import { filenameToBasicMetadata } from "../src/services/books";

describe("filenameToBasicMetadata", () => {
  it("parses author-title format", () => {
    expect(filenameToBasicMetadata("Brandon Sanderson - Mistborn.epub")).toEqual({
      author: "Brandon Sanderson",
      title: "Mistborn"
    });
  });

  it("parses title by author format", () => {
    expect(filenameToBasicMetadata("The Hobbit by J.R.R. Tolkien.pdf")).toEqual({
      author: "J.R.R. Tolkien",
      title: "The Hobbit"
    });
  });

  it("parses [author] title and strips trailing year tag", () => {
    expect(filenameToBasicMetadata("[Terry Pratchett] Guards! Guards! (1989).epub")).toEqual({
      author: "Terry Pratchett",
      title: "Guards! Guards!"
    });
  });

  it("parses title-author format", () => {
    expect(filenameToBasicMetadata("Dune - Frank Herbert.epub")).toEqual({
      author: "Frank Herbert",
      title: "Dune"
    });
  });

  it("falls back to cleaned title when no author pattern exists", () => {
    expect(filenameToBasicMetadata("Project_Hail_Mary_(2021).epub")).toEqual({
      author: null,
      title: "Project Hail Mary"
    });
  });
});
