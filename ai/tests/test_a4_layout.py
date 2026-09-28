"""A4 page frame for multi-page exports: size, margins 30/20/22/20 mm and page numbers (NĐ 30/2020)."""

import io
import unittest

from app.reporting import document_bytes

MM = 72 / 25.4
LEFT, RIGHT, TOP, BOTTOM = 30 * MM, 20 * MM, 22 * MM, 20 * MM
WIDTH, HEIGHT = 210 * MM, 297 * MM


def long_blocks():
    paragraph = (
        'Nội dung thuyết minh có dấu tiếng Việt dùng để kiểm tra ngắt dòng và ngắt trang trong khổ giấy A4, '
        'bao gồm số liệu 1.234.567.890 VNĐ và ký hiệu m², %, ‰. '
    ) * 4
    rows = [['STT', 'Nội dung kiểm tra', 'Căn cứ', 'Kết luận']]
    rows += [
        [str(i), 'Hạng mục ' + str(i) + ' — ' + paragraph[:120], 'Điều 37 NĐ 217/2026', 'Đạt'] for i in range(1, 70)
    ]
    return [{'heading': 'Phần ' + str(n), 'text': [paragraph] * 3} for n in range(1, 6)] + [
        {'heading': 'Bảng tổng hợp', 'rows': rows}
    ]


class A4LayoutTests(unittest.TestCase):
    def test_pdf_pages_are_a4_with_text_inside_margins_and_page_numbers(self):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(document_bytes('Kiểm tra khổ giấy nhiều trang', long_blocks(), 'pdf', True)))
        self.assertGreater(len(reader.pages), 3)
        for number, page in enumerate(reader.pages, start=1):
            self.assertAlmostEqual(float(page.mediabox.width), WIDTH, places=1)
            self.assertAlmostEqual(float(page.mediabox.height), HEIGHT, places=1)
            positions = []

            def visitor(text, cm, tm, font, size):
                if text.strip():
                    positions.append((tm[4] * cm[0] + cm[4], tm[5] * cm[3] + cm[5], text.strip()))

            page.extract_text(visitor_text=visitor)
            footer = [p for p in positions if p[1] < BOTTOM]
            body = [p for p in positions if p[1] >= BOTTOM]
            self.assertTrue(any('Trang ' + str(number) in text for _, _, text in footer), 'page number missing')
            for x, y, text in body:
                self.assertGreaterEqual(x, LEFT - 1, text)
                self.assertLessEqual(x, WIDTH - RIGHT, text)
                self.assertLessEqual(y, HEIGHT - TOP + 1, text)

    def test_docx_section_is_a4_with_standard_margins(self):
        from docx import Document
        from docx.shared import Mm

        document = Document(io.BytesIO(document_bytes('Kiểm tra DOCX', long_blocks(), 'docx', True)))
        # Word stores lengths in twips, so allow the 0.1 mm rounding of the unit conversion.
        close = lambda actual, expected: self.assertLess(abs(actual - Mm(expected)), Mm(0.1))
        for section in document.sections:
            for actual, expected in [
                (section.page_width, 210),
                (section.page_height, 297),
                (section.left_margin, 30),
                (section.right_margin, 20),
                (section.top_margin, 22),
                (section.bottom_margin, 20),
            ]:
                close(actual, expected)
            self.assertIn('PAGE', section.footer.paragraphs[0]._p.xml)


if __name__ == '__main__':
    unittest.main()
