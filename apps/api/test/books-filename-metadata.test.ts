import { describe, expect, it } from "vitest";
import { filenameToBasicMetadata } from "../src/services/books";

describe("filenameToBasicMetadata", () => {
  // --- Standard formats ---

  it("parses author-title format", () => {
    expect(filenameToBasicMetadata("Brandon Sanderson - Mistborn.epub")).toEqual({
      author: "Brandon Sanderson",
      title: "Mistborn",
      series: null
    });
  });

  it("parses title by author format", () => {
    expect(filenameToBasicMetadata("The Hobbit by J.R.R. Tolkien.pdf")).toEqual({
      author: "J.R.R. Tolkien",
      title: "The Hobbit",
      series: null
    });
  });

  it("parses [author] title and strips trailing year tag", () => {
    expect(filenameToBasicMetadata("[Terry Pratchett] Guards! Guards! (1989).epub")).toEqual({
      author: "Terry Pratchett",
      title: "Guards! Guards!",
      series: null
    });
  });

  it("parses title-author format", () => {
    expect(filenameToBasicMetadata("Dune - Frank Herbert.epub")).toEqual({
      author: "Frank Herbert",
      title: "Dune",
      series: null
    });
  });

  it("falls back to cleaned title when no author pattern exists", () => {
    expect(filenameToBasicMetadata("Project_Hail_Mary_(2021).epub")).toEqual({
      author: null,
      title: "Project Hail Mary",
      series: null
    });
  });

  // --- Anna's Archive format ---

  it("parses Anna's Archive format with series info", () => {
    const result = filenameToBasicMetadata(
      "A Court of Silver Flames (A Court of Thorns and Roses #4) -- Sarah J_ Maas [Maas, Sarah J_] -- A Court of Thorns and Roses, 4, 1, 2021 -- Bloomsbury -- 9781526632715 -- a9e6503ebec037e161ad1ec451fb01b6 -- Anna's Archive.epub"
    );
    expect(result.title).toBe("A Court of Silver Flames");
    expect(result.author).toBe("Sarah J Maas");
    expect(result.series).toBe("A Court of Thorns and Roses #4");
  });

  it("parses Anna's Archive with simple author", () => {
    const result = filenameToBasicMetadata(
      "Bared to You -- Sylvia Day [Sylvia Day] -- Crossfire #1, 2012 -- ea73a53eec3a55fc1c2279dfceb4d079 -- Anna's Archive.epub"
    );
    expect(result.title).toBe("Bared to You");
    expect(result.author).toBe("Sylvia Day");
    expect(result.series).toBe("Crossfire #1");
  });

  it("parses Anna's Archive with subtitle", () => {
    const result = filenameToBasicMetadata(
      "Flawless _ a small town enemies to lovers romance -- Elsie Silver -- A Chestnut Springs novel, Special edition, Place of -- Brower Literary & -- 9781959285854 -- 8d34716bab40ac5afc8a3b62ed9ce85c -- Anna's Archive.epub"
    );
    expect(result.title).toContain("Flawless");
    expect(result.author).toBe("Elsie Silver");
  });

  it("parses Anna's Archive with dash in title", () => {
    const result = filenameToBasicMetadata(
      "Fourth Wing - The Empyrean #1 -- Rebecca Yarros -- Shrewsbury, PA, 2023 -- Entangled Publishing, LLC -- 9781649374080 -- 9020776428adf8e33943739a4dcc8b95 -- Anna's Archive.epub"
    );
    expect(result.title).toBe("Fourth Wing");
    expect(result.author).toBe("Rebecca Yarros");
    expect(result.series).toBe("The Empyrean #1");
  });

  it("parses Anna's Archive with Last, First author", () => {
    const result = filenameToBasicMetadata(
      "The Siren -- Reisz, Tiffany -- Don Mills, Ontario, Canada, ©2012 -- MIRA -- 9781408970072 -- 31b5c8693a0047eb161068f736e113a5 -- Anna's Archive.epub"
    );
    expect(result.title).toBe("The Siren");
    expect(result.author).toBe("Tiffany Reisz");
  });

  it("parses Anna's Archive with series in third segment", () => {
    const result = filenameToBasicMetadata(
      "Wild Love -- Elsie Silver -- Rose Hill, 1, 1, 2024 -- Elsie Silver Literary Inc_ -- 741783df026272a9d21b6f04a59252f8 -- Anna's Archive.epub"
    );
    expect(result.title).toBe("Wild Love");
    expect(result.author).toBe("Elsie Silver");
    expect(result.series).toBe("Rose Hill #1");
  });

  // --- z-lib format ---

  it("parses z-lib format with author in parentheses", () => {
    const result = filenameToBasicMetadata(
      "A Gentleman in Moscow (Towles, Amor) (z-lib.org).epub"
    );
    expect(result.title).toBe("A Gentleman in Moscow");
    expect(result.author).toBe("Amor Towles");
  });

  it("parses z-lib format with long title", () => {
    const result = filenameToBasicMetadata(
      "365 Days With Self-Discipline 365 Life-Altering Thoughts on Self-Control, Mental Resilience, and Success (Martin Meadows) (z-lib.org).epub"
    );
    expect(result.title).toContain("365 Days With Self-Discipline");
    expect(result.author).toBe("Martin Meadows");
  });

  it("parses z-lib with simple author", () => {
    const result = filenameToBasicMetadata(
      "To the Lighthouse (Virginia Woolf) (z-lib.org).epub"
    );
    expect(result.title).toBe("To the Lighthouse");
    expect(result.author).toBe("Virginia Woolf");
  });

  it("parses z-lib with series in title", () => {
    const result = filenameToBasicMetadata(
      "Wind and Truth - Stormlight Archive, Book 5 (Brandon Sanderson) (Z-Library).epub"
    );
    expect(result.title).toBe("Wind and Truth");
    expect(result.author).toBe("Brandon Sanderson");
    expect(result.series).toBe("Stormlight Archive #5");
  });

  // --- libgen format ---

  it("parses libgen format with year and publisher", () => {
    const result = filenameToBasicMetadata(
      "Haratischwili, Nino - Het achtste leven (2014, Atlas Contact) - libgen.li.epub"
    );
    expect(result.title).toBe("Het achtste leven");
    expect(result.author).toBe("Nino Haratischwili");
  });

  it("parses libgen with underscore-encoded title", () => {
    const result = filenameToBasicMetadata(
      "Andrea Elliott - Invisible Child_ Poverty, Survival & Hope in an American City (2021, Random House Publishing Group) - libgen.li.mobi"
    );
    expect(result.title).toContain("Invisible Child");
    expect(result.author).toBe("Andrea Elliott");
  });

  it("parses libgen with full date", () => {
    const result = filenameToBasicMetadata(
      "Sarah J. Maas - The Assassin's Blade_ The Throne of Glass Novellas (2014-03-13, Bloomsbury) - libgen.li.epub"
    );
    expect(result.title).toContain("Assassin");
    expect(result.author).toBe("Sarah J. Maas");
  });

  // --- Series prefix format ---

  it("parses series prefix with parentheses", () => {
    const result = filenameToBasicMetadata(
      "(A Court of Thorns and Roses 1) Sarah J. Maas - A Court of Thorns and Roses.epub"
    );
    expect(result.title).toBe("A Court of Thorns and Roses");
    expect(result.author).toBe("Sarah J. Maas");
    expect(result.series).toBe("A Court of Thorns and Roses #1");
  });

  it("parses series prefix with brackets and libgen suffix", () => {
    const result = filenameToBasicMetadata(
      "[Throne of Glass 1] Maas, Sarah J - Throne of Glass (2012, Bloomsbury Publishing Plc) - libgen.li.epub"
    );
    expect(result.title).toBe("Throne of Glass");
    expect(result.author).toBe("Sarah J Maas");
    expect(result.series).toBe("Throne of Glass #1");
  });

  it("parses series prefix with Last, First author", () => {
    const result = filenameToBasicMetadata(
      "(Throne of Glass 3) Maas, Sarah J - Heir of Fire.epub"
    );
    expect(result.title).toBe("Heir of Fire");
    expect(result.author).toBe("Sarah J Maas");
    expect(result.series).toBe("Throne of Glass #3");
  });

  // --- Simple format ---

  it("parses simple author - title with trailing year", () => {
    const result = filenameToBasicMetadata(
      "Dave Eggers - The Circle-Knopf (2013).epub"
    );
    expect(result.author).toBe("Dave Eggers");
    expect(result.title).toContain("Circle");
  });

  // --- Zafon series ---

  it("parses Zafon bracket-series libgen format", () => {
    const result = filenameToBasicMetadata(
      "Zafon, Carlos Ruiz - [Kerkhof der vergeten boeken 01] De schaduw van de wind.epub"
    );
    expect(result.author).toBe("Carlos Ruiz Zafon");
    expect(result.title).toBe("De schaduw van de wind");
  });
});
