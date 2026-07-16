from pptx import Presentation
from pptx.util import Inches
from slides import slide_07_egitim_inference

SLIDE_BUILDERS = [
    slide_07_egitim_inference,
]

def main():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    for builder in SLIDE_BUILDERS:
        builder.build(prs)
    output_path = "output/slide_07_egitim_inference.pptx"
    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    prs.save(output_path)
    print(f"Sunum olusturuldu: {output_path}")

if __name__ == "__main__":
    main()
